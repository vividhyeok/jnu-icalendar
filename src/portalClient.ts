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
const SSO_NAVIGATION_TIMEOUT_MS = 30_000;

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

function parseJson(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new Error('Portal timetable response is not valid JSON'); }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The portal can briefly return a small JSON session/auth object immediately
 * after the login submit while the hidden SSO iframe is still completing. A
 * timetable response is identifiable by the presence of classTables.
 */
function isJsonSessionPending(json: unknown) {
  return isObject(json) && !Object.prototype.hasOwnProperty.call(json, 'classTables');
}

function valueType(value: unknown) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Log only structural metadata. Never log response values, HTML, credentials,
 * cookies, tokens, or dialog text.
 */
function logSafePayloadShape(json: unknown) {
  if (!isObject(json)) {
    console.warn('Portal timetable payload shape: top=' + valueType(json));
    return;
  }

  const topKeys = Object.keys(json).sort().slice(0, 20);
  const classTables = json.classTables;
  const classTablesShape = Array.isArray(classTables)
    ? 'array(' + classTables.length + ')'
    : valueType(classTables);

  let rowKeys = '-';
  let fieldTypes = '-';
  if (Array.isArray(classTables) && isObject(classTables[0])) {
    const first = classTables[0];
    rowKeys = Object.keys(first).sort().slice(0, 40).join(',');
    const fields = [
      'estblScyr', 'lsnYmd', 'sbjctNm', 'cclctYn', 'splctYn',
      'aftrSplctLttmSe', 'untactLsnMthdSe', 'lctrmNm', 'empno', 'empnm',
      'bgngHr', 'endHr',
    ];
    fieldTypes = fields.map(field => field + ':' + valueType(first[field])).join(',');
  }

  console.warn(
    'Portal timetable payload shape: topKeys=[' + topKeys.join(',') + ']'
      + '; classTables=' + classTablesShape
      + '; firstRowKeys=[' + rowKeys + ']'
      + '; expectedFieldTypes=[' + fieldTypes + ']'
  );
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

function isPortalIndexUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'portal.jejunu.ac.kr' && parsed.pathname === '/index.htm';
  } catch {
    return false;
  }
}

const SSO_STAGE_PATHS = new Set([
  '/login.htm',
  '/sso/ssoLogin.jsp',
  '/authentication/issacweb/loginProcess',
  '/sso/checkauth.jsp',
  '/sso/agentProc.jsp',
  '/index.htm',
]);

/**
 * Emit only host/path/status for the known SSO chain observed in a normal login.
 * Query strings, request bodies, cookies and response bodies are intentionally
 * excluded because they may contain credentials or authentication tokens.
 */
function logSsoStage(response: HTTPResponse) {
  try {
    const url = new URL(response.url());
    if (!['portal.jejunu.ac.kr', 'sso.jejunu.ac.kr'].includes(url.hostname)) return;
    if (!SSO_STAGE_PATHS.has(url.pathname)) return;
    console.info('Portal SSO stage: ' + url.hostname + url.pathname + ' -> ' + response.status());
  } catch {
    // Ignore malformed/unexpected URLs in diagnostic logging.
  }
}

/**
 * Submit the portal login form and wait for the real SSO completion signal.
 * The JNU flow performs several iframe/form posts after the click and only
 * establishes the portal session when the top-level page reaches /index.htm.
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

  // Register the top-level navigation wait before clicking so a fast SSO redirect
  // cannot race past Puppeteer. iframe navigations do not satisfy this wait.
  const navigationPromise = page.waitForNavigation({
    waitUntil: 'domcontentloaded',
    timeout: SSO_NAVIGATION_TIMEOUT_MS,
  });

  await page.click('button[type="submit"]');
  console.info('Portal login submit clicked; waiting for SSO completion');

  try {
    await navigationPromise;
  } catch (error) {
    // If navigation completed but Puppeteer's lifecycle bookkeeping timed out,
    // trust the final top-level URL. Otherwise the session was not established.
    if (!isNavigationTimeout(error) || !isPortalIndexUrl(page.url())) throw error;
    console.warn('Portal SSO navigation wait timed out after reaching /index.htm');
  }

  if (!isPortalIndexUrl(page.url())) {
    throw new Error(AUTH_FAILURE);
  }

  console.info('Portal SSO completed at /index.htm');
}

/**
 * Verify the authenticated browser session using same-origin fetch from the
 * authenticated portal page.
 */
export async function fetchTimetableFromPage(page: Page, range: SyncRange): Promise<Lecture[]> {
  const url = timetableUrl(range);

  for (let attempt = 1; attempt <= AUTH_VERIFY_ATTEMPTS; attempt += 1) {
    let response: BrowserFetchResponse;

    try {
      // Deliberately avoid an async callback here. This function is serialized and
      // executed inside Chrome; downlevel TypeScript async helpers such as __awaiter
      // do not exist in the page context.
      response = await page.evaluate(targetUrl => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);

        return fetch(targetUrl, {
          credentials: 'include',
          cache: 'no-store',
          redirect: 'follow',
          signal: controller.signal,
        }).then(result => result.text().then(text => ({
          status: result.status,
          url: result.url,
          text,
        }))).finally(() => clearTimeout(timeout));
      }, url);
    } catch (error) {
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

    const json = parseJson(response.text);

    if (isJsonSessionPending(json)) {
      if (attempt === 1) console.info('Portal timetable API session not ready; polling');
      if (attempt === AUTH_VERIFY_ATTEMPTS) {
        logSafePayloadShape(json);
        throw new Error(AUTH_FAILURE);
      }
      await sleep(AUTH_VERIFY_DELAY_MS);
      continue;
    }

    try { return parsePortalResponse(response.text); }
    catch (error) {
      logSafePayloadShape(json);
      throw normalizePortalPayloadError(error);
    }
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

      const dialogHandler = (dialog: Dialog) => { void dialog.dismiss().catch(() => {}); };
      const responseHandler = (response: HTTPResponse) => { logSsoStage(response); };
      page.on('dialog', dialogHandler);
      page.on('response', responseHandler);

      try {
        await login(page, username, password);
        console.info('Portal login flow completed');

        const lectures = await fetchTimetableFromPage(page, range);
        if (lectures.some(row => row.lsnYmd < range.start || row.lsnYmd > range.end)) {
          throw new Error('Portal schema error: dates outside requested range');
        }

        console.info('Portal session verified through timetable API: ' + lectures.length + ' rows');
        return lectures;
      } finally {
        page.off('dialog', dialogHandler);
        page.off('response', responseHandler);
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
