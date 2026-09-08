import puppeteer, { type Page } from 'puppeteer';
import { readConfig } from './env';
import { parsePortalResponse, type Lecture } from './response';
import { withRetry } from './retry';
import { getSyncRange, type SyncRange } from './dateRange';

const LOGIN_URL = 'https://portal.jejunu.ac.kr/login.htm';
const TIMETABLE_ENDPOINT = 'https://portal.jejunu.ac.kr/api/patis/timeTable.jsp';

export async function login(page: Page, username: string, password: string) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#userId');
  await page.waitForSelector('#userPswd');
  await page.type('#userId', username);
  await page.type('#userPswd', password);
  let rejected = false;
  const controller = new AbortController();
  let rejectLogin: (value: string) => void = () => {};
  const rejection = new Promise<string>(resolve => { rejectLogin = resolve; });
  // Never log dialog text: the portal may echo account information.
  const dialogHandler = async (dialog: import('puppeteer').Dialog) => {
    rejected = true;
    rejectLogin('rejected');
    await dialog.dismiss().catch(() => {});
  };
  page.on('dialog', dialogHandler);
  try {
    // Login posts to a hidden iframe, which executes SSO JavaScript.
    // Wait for the resulting authenticated document, not network idleness.
    const complete = page.waitForFunction(() => {
      if (document.querySelector('.bootbox.show, .swal2-popup.swal2-show')) return 'rejected';
      return location.origin === 'https://portal.jejunu.ac.kr'
        && location.pathname === '/index.htm'
        && !document.querySelector('#userPswd') ? 'authenticated' : false;
    }, { timeout: 30_000, signal: controller.signal });
    // Attach rejection immediately so a failed click cannot leave an unhandled promise.
    const checked = Promise.race([complete.then(async handle => {
      try { return await handle.jsonValue(); } finally { await handle.dispose(); }
    }), rejection]);
    const [result] = await Promise.all([checked, page.click('button[type="submit"]')]);
    if (result === 'rejected') { rejected = true; throw new Error('Login rejected'); }
  } catch (error) {
    if (rejected) throw new Error('Portal authentication failed. Check PORTAL_USERNAME/PASSWORD or required account verification.');
    throw error;
  } finally {
    controller.abort();
    page.off('dialog', dialogHandler);
  }
}

export function isRetriablePortalError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /timeout|network|net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|HTTP (429|5\d\d)/i.test(message);
}

export async function fetchPortalLectures(range: SyncRange = getSyncRange()): Promise<Lecture[]> {
  const { username, password } = readConfig();
  return withRetry(async () => {
    const browser = await puppeteer.launch({
      headless: true, timeout: 30_000, protocolTimeout: 45_000,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(30_000);
      await login(page, username, password);
      const url = TIMETABLE_ENDPOINT + '?sttLsnYmd=' + range.start + '&endLsnYmd=' + range.end;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (!response || !response.ok()) throw new Error('Portal HTTP ' + (response?.status() ?? 'NO_RESPONSE'));
      const lectures = parsePortalResponse(await response.text());
      if (lectures.some(row => row.lsnYmd < range.start || row.lsnYmd > range.end)) {
        throw new Error('Portal schema error: dates outside requested range');
      }
      return lectures;
    } finally {
      await browser.close();
    }
  }, {
    retries: 2, delayMs: 2000, shouldRetry: isRetriablePortalError,
    onRetry(_error, attempt) { console.warn('Portal transient failure; retry ' + attempt); },
  });
}
