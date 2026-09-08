import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  page: {
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    type: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    click: vi.fn(),
    evaluate: vi.fn(),
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
  return {
    status: options.status ?? 200,
    url: options.url ?? TIMETABLE_URL,
    text,
  };
}

beforeEach(() => {
  Object.values(state.page).forEach(fn => fn.mockReset());
  state.close.mockReset().mockResolvedValue(undefined);
  state.newPage.mockReset().mockResolvedValue(state.page);
  state.launch.mockReset().mockResolvedValue({ newPage: state.newPage, close: state.close });

  state.page.goto.mockResolvedValue({});
  state.page.waitForSelector.mockResolvedValue(undefined);
  state.page.type.mockResolvedValue(undefined);
  state.page.click.mockResolvedValue(undefined);
  state.page.evaluate.mockResolvedValue(response(VALID_PAYLOAD));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('uses one browser page and timetable API response as authentication source of truth', async () => {
  expect(await fetchPortalLectures()).toEqual([]);
  expect(state.newPage).toHaveBeenCalledOnce();
  expect(state.page.goto).toHaveBeenCalledOnce();
  expect(state.page.evaluate).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('informational login dialog is dismissed and does not fail authentication', async () => {
  const dismiss = vi.fn().mockResolvedValue(undefined);
  state.page.click.mockImplementation(async () => {
    const handler = state.page.on.mock.calls.find(call => call[0] === 'dialog')?.[1];
    expect(handler).toBeTypeOf('function');
    handler({ dismiss });
    await Promise.resolve();
  });

  expect(await fetchPortalLectures()).toEqual([]);
  expect(dismiss).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('navigation timeout is tolerated when login form is already rendered', async () => {
  state.page.goto.mockRejectedValueOnce(new Error('Navigation timeout of 15000 ms exceeded'));

  expect(await fetchPortalLectures()).toEqual([]);
  expect(state.page.waitForSelector).toHaveBeenCalledTimes(2);
  expect(state.page.evaluate).toHaveBeenCalledOnce();
});

test('temporary login-page response is retried until timetable JSON appears', async () => {
  vi.useFakeTimers();
  state.page.evaluate
    .mockResolvedValueOnce(response(LOGIN_HTML, { url: 'https://portal.jejunu.ac.kr/login.htm' }))
    .mockResolvedValueOnce(response(VALID_PAYLOAD));

  const promise = fetchPortalLectures();
  await Promise.resolve();
  await vi.runAllTimersAsync();

  await expect(promise).resolves.toEqual([]);
  expect(state.page.evaluate).toHaveBeenCalledTimes(2);
  expect(state.close).toHaveBeenCalledOnce();
});

test('temporary JSON session response is polled until timetable JSON appears', async () => {
  vi.useFakeTimers();
  state.page.evaluate
    .mockResolvedValueOnce(response('{"authenticated":false}'))
    .mockResolvedValueOnce(response(VALID_PAYLOAD));

  const promise = fetchPortalLectures();
  await Promise.resolve();
  await vi.runAllTimersAsync();

  await expect(promise).resolves.toEqual([]);
  expect(state.page.evaluate).toHaveBeenCalledTimes(2);
  expect(state.launch).toHaveBeenCalledOnce();
});

test('transient execution-context replacement is retried in the same browser session', async () => {
  vi.useFakeTimers();
  state.page.evaluate
    .mockRejectedValueOnce(new Error('Execution context was destroyed, most likely because of a navigation.'))
    .mockResolvedValueOnce(response(VALID_PAYLOAD));

  const promise = fetchPortalLectures();
  await Promise.resolve();
  await vi.runAllTimersAsync();

  await expect(promise).resolves.toEqual([]);
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.newPage).toHaveBeenCalledOnce();
  expect(state.page.evaluate).toHaveBeenCalledTimes(2);
});

test('persistent login-page response becomes a non-retriable authentication failure', async () => {
  vi.useFakeTimers();
  state.page.evaluate.mockResolvedValue(response(LOGIN_HTML, {
    url: 'https://portal.jejunu.ac.kr/login.htm',
  }));

  const assertion = expect(fetchPortalLectures()).rejects.toThrow('Portal authentication failed');
  await Promise.resolve();
  await vi.runAllTimersAsync();
  await assertion;

  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('persistent JSON response without classTables becomes authentication failure', async () => {
  vi.useFakeTimers();
  state.page.evaluate.mockResolvedValue(response('{"authenticated":false,"message":"fixture"}'));

  const assertion = expect(fetchPortalLectures()).rejects.toThrow('Portal authentication failed');
  await Promise.resolve();
  await vi.runAllTimersAsync();
  await assertion;

  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.page.evaluate).toHaveBeenCalledTimes(12);
  expect(state.close).toHaveBeenCalledOnce();
});

test('HTTP 403 is an authentication failure without retrying', async () => {
  state.page.evaluate.mockResolvedValue(response('', { status: 403 }));
  await expect(fetchPortalLectures()).rejects.toThrow('Portal authentication failed');
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('non-login malformed payload is not mislabeled as authentication failure', async () => {
  state.page.evaluate.mockResolvedValue(response('definitely-not-json'));
  await expect(fetchPortalLectures()).rejects.toThrow('Portal timetable response is not valid JSON');
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test('classTables with invalid shape stays a schema error without outer retry', async () => {
  state.page.evaluate.mockResolvedValue(response('{"classTables":{}}'));
  await expect(fetchPortalLectures()).rejects.toThrow('schema');
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.page.evaluate).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});

test.each([
  'Portal HTTP 503',
  'Portal HTTP 429',
  'Navigation timeout',
  'network failure',
  'fetch failed',
  'Failed to fetch',
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
