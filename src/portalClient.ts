import puppeteer, { type Dialog, type Page } from 'puppeteer';
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

interface BrowserFetchResponse {
  status: number;
  url: string;
  text: string;
}

function timetableUrl(range: SyncRange) {
  return TIMETABLE_ENDPOINT + '?sttLsnYmd=' + encodeURIComponent(range.start)
    + '&endLsnYmd=' + encodeURIComponent(range.end);
}

function looksLikeLoginResponse(response: BrowserFetchResponse) {
  let path = '';
  try { path = new URL(response.url).pathname.toLowerCase(); }
  catch { /* fall back to body inspection */ }

  if (path.includes('/login')) return true;

  const sample = response.text.slice(0, 12_000).toLowerCase();
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

function isNavigationTimeout(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout/i.test(message);
}

function isTransientPageContextError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /execution context was destroyed|cannot find context|frame was detached|target closed|protocol error/i.test(message);
}

/**
 * Submit the portal login form only. The UI/redirect itself is deliberately not
 * treated as proof of authentication; the timetable API verifies the session.
 */
export async function login(page: Page, username: string, password: string) {
  console.info('Portal login page opening');
  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  } catch (error) {
    // Some portal resources can keep navigation bookkeeping alive even after the
    // login DOM is usable. On a pure navigation timeout, verify the rendered form
    // instead of failing the whole attempt immediately.
    if (!isNavigationTimeout(error)) throw error;
    console.warn('Portal login navigation timed out; checking rendered form');
  }

  console.info('Portal login form locating');
  await page.waitForSelector('#userId', { timeout: 15_000 });
  await page.waitForSelector('#userPswd', { timeout: 15_000 });
  console.info('Portal login form ready');

  await page.type('#userId', username);
  await page.type('#userPswd', password);
  await page.click('button[type="submit"]');
  console.info('Portal login submit clicked');
}

/**
 * Verify the authenticated browser session using same-origin fetch from the
 * existing login page. This keeps hidden-iframe SSO work alive and avoids a
 * second Puppeteer Page / navigation target in constrained Cloud Run jobs.
 */
export async function fetchTimetableFromPage(page: Page, range: SyncRange): Promise<Lecture[]> {
  const url = timetableUrl(range);

  for (let attempt = 1; attempt <= AUTH_VERIFY_ATTEMPTS; attempt += 1) {
    let response: BrowserFetchResponse;

    try {
      response = await page.evaluate(async targetUrl => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        try {
          const result = await fetch(targetUrl, {
            credentials: 'include',
            cache: 'no-store',
            redirect: 'follow',
            signal: controller.signal,
          });

          return {
            status: result.status,
            url: result.url,
            text: await result.text(),
          };
        } finally {
          clearTimeout(timeout);
        }
      }, url);
    } catch (error) {
      // The top-level portal can redirect while the hidden SSO frame is finishing.
      // If that destroys the JS execution context, wait briefly and try again in
      // the new context without restarting the whole browser/session.
      if (isTransientPageContextError(error) && attempt < AUTH_VERIFY_ATTEMPTS) {
        await sleep(AUTH_VERIFY_DELAY_MS);
        continue;
      }
      throw error;
    }

    if (response.status === 429 || response.status >= 500) {
      throw new Error('Portal HTTP ' + response.status);
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(AUTH_FAILURE);
    }

    if (looksLikeLoginResponse(response)) {
      if (attempt === AUTH_VERIFY_ATTEMPTS) throw new Error(AUTH_FAILURE);
      await sleep(AUTH_VERIFY_DELAY_MS);
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error('Portal HTTP ' + response.status);
    }

    try { return parsePortalResponse(response.text); }
    catch (error) { throw normalizePortalPayloadError(error); }
  }

  throw new Error(AUTH_FAILURE);
}

export function isRetriablePortalError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /timeout|network|fetch failed|failed to fetch|net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|HTTP (429|5\d\d)/i.test(message);
}

export async function fetchPortalLectures(range: SyncRange = getSyncRange()): Promise<Lecture[]> {
  const { username, password } = readConfig();

  return withRetry(async () => {
    console.info('Portal browser launching');
    const browser = await puppeteer.launch({
      headless: true,
      timeout: 30_000,
      protocolTimeout: 45_000,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      console.info('Portal browser launched');
      const page = await browser.newPage();
      page.setDefaultTimeout(30_000);
      console.info('Portal page created');

      // Informational dialogs must not decide authentication. Dismiss them without
      // logging their text because portal dialogs may contain account information.
      const dialogHandler = (dialog: Dialog) => { void dialog.dismiss().catch(() => {}); };
      page.on('dialog', dialogHandler);

      try {
        await login(page, username, password);
        console.info('Portal login form submitted');

        const lectures = await fetchTimetableFromPage(page, range);
        if (lectures.some(row => row.lsnYmd < range.start || row.lsnYmd > range.end)) {
          throw new Error('Portal schema error: dates outside requested range');
        }

        console.info('Portal session verified through timetable API: ' + lectures.length + ' rows');
        return lectures;
      } finally {
        page.off('dialog', dialogHandler);
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
