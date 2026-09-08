import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loginPage: {
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    type: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    click: vi.fn(),
    setDefaultTimeout: vi.fn(),
  },
  timetablePage: {
    goto: vi.fn(),
    setDefaultTimeout: vi.fn(),
  },
  close: vi.fn(),
  launch: vi.fn(),
  newPage: vi.fn(),
}));

vi.mock('puppeteer', () => ({ default: { launch: state.launch } }));
vi.mock('../env', () => ({
  readConfig: () => ({ username: 'fixture', password: 'fixture', calendarId: 'fixture-calendar' }),
}));

import { fetchPortalLectures, isRetriablePortalError } from '../portalClient';

const TIMETABLE_URL = 'https://portal.jejunu.ac.kr/api/patis/timeTable.jsp';
const VALID_PAYLOAD = '{"classTables":[]}';
const LOGIN_HTML = '<!doctype html><html><form action="/login.htm"><input id="userId"><input id="userPswd"></form></html>';

function response(text: string, options: { status?: number; url?: string } = {}) {
  const status = options.status ?? 200;
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    url: () => options.url ?? TIMETABLE_URL,
    text: async () => text,
  };
}

beforeEach(() => {
  for (const page of [state.loginPage, state.timetablePage]) {
    Object.values(page).forEach(fn => fn.mockReset());
  }

  state.close.mockReset().mockResolvedValue(undefined);
  state.newPage.mockReset()
    .mockResolvedValueOnce(state.loginPage)
    .mockResolvedValueOnce(state.timetablePage);
  state.launch.mockReset().mockResolvedValue({ newPage: state.newPage, close: state.close });

  state.loginPage.goto.mockResolvedValue({});
  state.loginPage.waitForSelector.mockResolvedValue(undefined);
  state.loginPage.type.mockResolvedValue(undefined);
  state.loginPage.click.mockResolvedValue(undefined);
  state.timetablePage.goto.mockResolvedValue(response(VALID_PAYLOAD));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('valid timetable API response is the authentication source of truth', async () => {
  expect(await fetchPortalLectures()).toEqual([]);
  expect(state.loginPage.goto).toHaveBeenCalledOnce();
  expect(state.timetablePage.goto).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('informational login dialog is dismissed and does not fail authentication', async () => {
  const dismiss = vi.fn().mockResolvedValue(undefined);
  state.loginPage.click.mockImplementation(async () => {
    const handler = state.loginPage.on.mock.calls.find(call => call[0] === 'dialog')?.[1];
    expect(handler).toBeTypeOf('function');
    handler({ dismiss });
    await Promise.resolve();
  });

  expect(await fetchPortalLectures()).toEqual([]);
  expect(dismiss).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('temporary login-page response is retried until timetable JSON appears', async () => {
  vi.useFakeTimers();
  state.timetablePage.goto
    .mockResolvedValueOnce(response(LOGIN_HTML, { url: 'https://portal.jejunu.ac.kr/login.htm' }))
    .mockResolvedValueOnce(response(VALID_PAYLOAD));

  const promise = fetchPortalLectures();
  await Promise.resolve();
  await vi.runAllTimersAsync();

  await expect(promise).resolves.toEqual([]);
  expect(state.timetablePage.goto).toHaveBeenCalledTimes(2);
  expect(state.close).toHaveBeenCalledOnce();
});

test('persistent login-page response becomes a non-retriable authentication failure', async () => {
  vi.useFakeTimers();
  state.timetablePage.goto.mockResolvedValue(response(LOGIN_HTML, {
    url: 'https://portal.jejunu.ac.kr/login.htm',
  }));

  const assertion = expect(fetchPortalLectures()).rejects.toThrow('Portal authentication failed');
  await Promise.resolve();
  await vi.runAllTimersAsync();
  await assertion;

  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('HTTP 403 is an authentication failure without retrying', async () => {
  state.timetablePage.goto.mockResolvedValue(response('', { status: 403 }));
  await expect(fetchPortalLectures()).rejects.toThrow('Portal authentication failed');
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('non-login malformed payload is not mislabeled as authentication failure', async () => {
  state.timetablePage.goto.mockResolvedValue(response('definitely-not-json'));
  await expect(fetchPortalLectures()).rejects.toThrow('Portal timetable response is not valid JSON');
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('schema errors do not retry and browser closes', async () => {
  state.timetablePage.goto.mockResolvedValue(response('{}'));
  await expect(fetchPortalLectures()).rejects.toThrow('schema');
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test.each([
  'Portal HTTP 503',
  'Portal HTTP 429',
  'Navigation timeout',
  'network failure',
  'fetch failed',
  'net::ERR_CONNECTION_RESET',
])('retries transient %s', message => {
  expect(isRetriablePortalError(new Error(message))).toBe(true);
});

test.each([
  'Portal HTTP 403',
  'Portal schema error',
  'Portal authentication failed',
  'Portal timetable response is not valid JSON',
])('does not retry %s', message => {
  expect(isRetriablePortalError(new Error(message))).toBe(false);
});
