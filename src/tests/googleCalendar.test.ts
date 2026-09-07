import crypto from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { CalendarEventPayload } from '../googleEvents';
import { getSyncRange } from '../dateRange';
const state = vi.hoisted(() => ({ events: [] as CalendarEventPayload[] }));
vi.mock('../env', () => ({ readConfig: () => ({ calendarId: 'private-calendar@example.com' }) }));
vi.mock('../googleAuth', () => ({ getAccessToken: async () => 'test-token' }));
vi.mock('../googleEvents', () => ({ buildCalendarEvents: () => state.events }));
import { syncGoogleCalendar } from '../googleCalendar';
const range = getSyncRange(new Date('2026-03-02T00:00:00+09:00'));
const event: CalendarEventPayload = {
  sourceKey: 'course|20260302', summary: 'Course', description: 'Teacher', location: 'Room',
  start: { dateTime: '2026-03-02T09:00:00+09:00', timeZone: 'Asia/Seoul' },
  end: { dateTime: '2026-03-02T09:50:00+09:00', timeZone: 'Asia/Seoul' },
};
const id = (key: string) => 'jnu' + crypto.createHash('sha256').update(key).digest('hex').slice(0,48);
const remote = (key = event.sourceKey) => ({
  ...event, id: id(key), extendedProperties: { private: { managedBy: 'jnu-google-calendar-sync', sourceKey: key } },
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let mutations: string[];
function install(items: unknown[], handler?: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    expect(init.signal).toBeDefined();
    if (!init.method) return json({ items });
    mutations.push(init.method);
    return handler?.(url, init) ?? json({});
  }));
}
beforeEach(() => { state.events = [event]; mutations = []; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
test('creates deterministic events, then skips unchanged events (also UTC timestamps)', async () => {
  const items: unknown[] = [];
  install(items, (_url, init) => { items.push(JSON.parse(String(init.body))); return json({}); });
  expect(await syncGoogleCalendar([], range)).toEqual({ inserted: 1, deleted: 0 });
  const saved = items[0] as ReturnType<typeof remote>;
  expect(saved.id).toBe(id(event.sourceKey));
  saved.start = { dateTime: '2026-03-02T00:00:00Z', timeZone: 'Asia/Seoul' };
  expect(await syncGoogleCalendar([], range)).toEqual({ inserted: 0, deleted: 0 });
  expect(mutations).toEqual(['POST']);
});
test.each(['summary','description','location'] as const)('updates changed %s', async field => {
  install([{ ...remote(), [field]: 'old' }]);
  expect(await syncGoogleCalendar([], range)).toEqual({ inserted: 1, deleted: 0 });
  expect(mutations).toEqual(['PUT']);
});
test('replaces changed source identity, then deletes only stale managed event', async () => {
  install([remote('old-course'), { ...remote('personal'), extendedProperties: undefined }]);
  expect(await syncGoogleCalendar([], range)).toEqual({ inserted: 1, deleted: 1 });
  expect(mutations).toEqual(['POST','DELETE']);
});
test('no events on either side is a normal empty result', async () => {
  state.events = []; install([]);
  expect(await syncGoogleCalendar([], range)).toEqual({ inserted: 0, deleted: 0 });
});
test('empty response cannot remove existing events', async () => {
  state.events = []; install([remote()]);
  await expect(syncGoogleCalendar([], range)).rejects.toThrow('Destructive sync blocked');
  expect(mutations).toEqual([]);
});
test('74 to 1 blocks all writes', async () => {
  install(Array.from({length:74}, (_,i) => remote(String(i))));
  await expect(syncGoogleCalendar([], range)).rejects.toThrow('dropped');
  expect(mutations).toEqual([]);
});
test('normal small cancellation deletes stale event', async () => {
  install([remote(),remote('cancelled')]);
  expect(await syncGoogleCalendar([], range)).toEqual({ inserted: 0, deleted: 1 });
});
test('moving window preserves old, future and boundary-overlapping events', async () => {
  state.events = [];
  install([
    { ...remote(), start: {dateTime:'2026-02-01T09:00:00+09:00'} },
    { ...remote(), end: {dateTime:'2026-05-01T09:00:00+09:00'} },
  ]);
  await expect(syncGoogleCalendar([], range)).rejects.toThrow('Destructive sync blocked');
  expect(mutations).toEqual([]);
});
test('semester end compares only remaining events in current window', async () => {
  install([remote(), ...Array.from({length:74}, (_,i) => ({...remote(String(i)), start:{dateTime:'2026-01-01T09:00:00+09:00'}}))]);
  expect(await syncGoogleCalendar([], range)).toEqual({ inserted: 0, deleted: 0 });
});
test('409 retries deterministic upsert with PUT', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (!init.method) return json(url.includes('?') ? {items:[]} : remote());
    mutations.push(init.method);
    return json({}, init.method === 'POST' ? 409 : 200);
  }));
  expect(await syncGoogleCalendar([], range)).toEqual({ inserted: 1, deleted: 0 });
  expect(mutations).toEqual(['POST','PUT']);
});
test('failed upsert never starts stale deletion', async () => {
  install([remote('stale')], () => json({ secret:'not logged' },403));
  await expect(syncGoogleCalendar([], range)).rejects.toThrow('403');
  expect(mutations).toEqual(['POST']);
});
test('API errors contain no response, path, token or calendar id', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({secret:'private-calendar@example.com'},403)));
  await expect(syncGoogleCalendar([], range)).rejects.toThrow('HTTP 403');
});
test('pagination failure aborts before writes', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(json({items:[remote()],nextPageToken:'next'}))
    .mockResolvedValueOnce(json({},403)));
  await expect(syncGoogleCalendar([], range)).rejects.toThrow('403');
  expect(mutations).toEqual([]);
});

test('unmanaged ID collision is never overwritten', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (!init.method) return json(url.includes('?') ? {items:[]} : {id:id(event.sourceKey)});
    mutations.push(init.method);return json({},409);
  }));
  await expect(syncGoogleCalendar([],range)).rejects.toThrow('unmanaged');
  expect(mutations).toEqual(['POST']);
});
