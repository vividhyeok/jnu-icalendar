import puppeteer, { type Dialog, type HTTPResponse, type Page } from 'puppeteer';
import { readConfig } from './env';
import { parsePortalResponse, type Lecture } from './response';
import { withRetry } from './retry';
import { getSyncRange, type SyncRange } from './dateRange';

const LOGIN_URL = 'https://portal.jejunu.ac.kr/login.htm';
const TIMETABLE_ENDPOINT = 'https://portal.jejunu.ac.kr/api/patis/timeTable.jsp';
const AUTH_FAILURE = 'Portal authentication failed. Check PORTAL_USERNAME/PASSWORD or required account verification.';
const AUTH_VERIFY_ATTEMPTS = 12;
const AUTH_VERIFY_DELAY_MS = 750;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function timetableUrl(range: SyncRange) {
  return TIMETABLE_ENDPOINT + '?sttLsnYmd=' + encodeURIComponent(range.start)
    + '&endLsnYmd=' + encodeURIComponent(range.end);
}

function looksLikeLoginResponse(response: HTTPResponse, text: string) {
  let path = '';
  try { path = new URL(response.url()).pathname.toLowerCase(); }
  catch { /* fall back to body inspection */ }

  if (path.includes('/login')) return true;

  const sample = text.slice(0, 12_000).toLowerCase();
  const looksLikeHtml = sample.includes('<!doctype') || sample.includes('<html') || sample.includes('<form');
  if (!looksLikeHtml) return false;

  return sample.includes('id="userid"')
    || sample.includes("id='userid'")
    || sample.includes('name="userid"')
    || sample.includes("name='userid'")
    || sample.includes('userpswd')
    || sample.includes('/login.htm');
}

function normalizePortalPayloadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/not JSON/i.test(message)) return new Error('Portal timetable response is not valid JSON');
  return error instanceof Error ? error : new Error('Portal timetable response is invalid');
}

/**
 * Submit the portal login form only. The UI/redirect itself is deliberately not
 * treated as proof of authentication; the timetable API verifies the session.
 */
export async function login(page: Page, username: string, password: string) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#userId');
  await page.waitForSelector('#userPswd');
  await page.type('#userId', username);
  await page.type('#userPswd', password);
  await page.click('button[type="submit"]');
}

/**
 * Verify the authenticated browser session using the actual timetable endpoint.
 * A short polling window lets the hidden-iframe SSO flow finish setting cookies.
 */
export async function fetchTimetableFromPage(page: Page, range: SyncRange): Promise<Lecture[]> {
  const url = timetableUrl(range);

  for (let attempt = 1; attempt <= AUTH_VERIFY_ATTEMPTS; attempt += 1) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response) throw new Error('Portal HTTP NO_RESPONSE');

    const status = response.status();
    if (status === 429 || status >= 500) throw new Error('Portal HTTP ' + status);

    const text = await response.text();
    if (status === 401 || status === 403) throw new Error(AUTH_FAILURE);

    if (looksLikeLoginResponse(response, text)) {
      if (attempt === AUTH_VERIFY_ATTEMPTS) throw new Error(AUTH_FAILURE);
      await sleep(AUTH_VERIFY_DELAY_MS);
      continue;
    }

    if (!response.ok()) throw new Error('Portal HTTP ' + status);

    try { return parsePortalResponse(text); }
    catch (error) { throw normalizePortalPayloadError(error); }
  }

  throw new Error(AUTH_FAILURE);
}

export function isRetriablePortalError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /timeout|network|fetch failed|net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|HTTP (429|5\d\d)/i.test(message);
}

export async function fetchPortalLectures(range: SyncRange = getSyncRange()): Promise<Lecture[]> {
  const { username, password } = readConfig();

  return withRetry(async () => {
    const browser = await puppeteer.launch({
      headless: true,
      timeout: 30_000,
      protocolTimeout: 45_000,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      // Separate pages share the same BrowserContext cookies/session. Keeping the
      // API navigation off the login page avoids interrupting iframe SSO work.
      const loginPage = await browser.newPage();
      const timetablePage = await browser.newPage();
      loginPage.setDefaultTimeout(30_000);
      timetablePage.setDefaultTimeout(30_000);

      // Informational dialogs must not decide authentication. Dismiss them without
      // logging their text because portal dialogs may contain account information.
      const dialogHandler = (dialog: Dialog) => { void dialog.dismiss().catch(() => {}); };
      loginPage.on('dialog', dialogHandler);

      try {
        await login(loginPage, username, password);
        console.info('Portal login form submitted');

        const lectures = await fetchTimetableFromPage(timetablePage, range);
        if (lectures.some(row => row.lsnYmd < range.start || row.lsnYmd > range.end)) {
          throw new Error('Portal schema error: dates outside requested range');
        }

        console.info('Portal session verified through timetable API: ' + lectures.length + ' rows');
        return lectures;
      } finally {
        loginPage.off('dialog', dialogHandler);
      }
    } finally {
      await browser.close();
    }
  }, {
    retries: 2,
    delayMs: 2000,
    shouldRetry: isRetriablePortalError,
    onRetry(_error, attempt) { console.warn('Portal transient failure; retry ' + attempt); },
  });
}
