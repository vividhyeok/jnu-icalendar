import { parseLectureStatus } from '../iCalConverter';
import { afterEach, expect, test, vi } from 'vitest';
import { getSyncRange } from '../dateRange';
import { parsePortalResponse } from '../response';
import { notifyDiscord } from '../notify';
import cases from './testcases.json';
afterEach(() => { vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks(); });
test('Seoul midnight and year boundary are independent of host timezone', () => {
  expect(getSyncRange(new Date('2026-12-31T15:00:00Z'))).toEqual({
    start:'20260825',end:'20270228',
    timeMin:'2026-08-25T00:00:00+09:00',timeMax:'2027-03-01T00:00:00+09:00',
  });
  expect(getSyncRange(new Date('2026-12-31T14:59:59Z')).start).toBe('20260825');
});
test('leap day', () => { expect(getSyncRange(new Date('2024-03-01T00:00:00+09:00')).start).toBe('20240223'); });
test('valid empty response', () => { expect(parsePortalResponse('{"classTables":[]}')).toEqual([]); });
test.each(['<html>login</html>','{}','null','{"classTables":null}','{"classTables":[{}]}'])('rejects invalid response %s', text => {
  expect(() => parsePortalResponse(text)).toThrow();
});
test('valid lecture round trip', () => {
  expect(parsePortalResponse(JSON.stringify({classTables:[cases.online.input]}))).toEqual([cases.online.input]);
});
test.each([{lsnYmd:'20260230'},{bgngHr:null},{bgngHr:'25:00'},{endHr:'01:00'},{cclctYn:'unexpected'}])('rejects partial or invalid lecture %j', change => {
  expect(() => parsePortalResponse(JSON.stringify({classTables:[{...cases.online.input,...change}]}))).toThrow('schema');
});
test('Discord is fully disabled without URL', async () => {
  vi.stubEnv('DISCORD_WEBHOOK_URL',''); const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await notifyDiscord('change');expect(fetch).not.toHaveBeenCalled();
});
test('Discord change message has timeout and disables mentions', async () => {
  vi.stubEnv('DISCORD_WEBHOOK_URL','https://discord.com/api/webhooks/test/fixture');
  const fetch=vi.fn().mockResolvedValue(new Response(null,{status:204}));vi.stubGlobal('fetch',fetch);
  await notifyDiscord('change');
  expect(fetch).toHaveBeenCalledWith(expect.any(URL),expect.objectContaining({
    signal:expect.any(AbortSignal),body:JSON.stringify({content:'change',allowed_mentions:{parse:[]}}),
  }));
});

test('normal and live online statuses remain distinct', () => {
  const row = {...cases.online.input, cclctYn:'N', splctYn:'N', aftrSplctLttmSe:null, untactLsnMthdSe:null};
  expect(parseLectureStatus(row)).toBe('\uC77C\uBC18');
  expect(parseLectureStatus({...row,splctYn:'Y',untactLsnMthdSe:'91'})).toBe('\uC628\uB77C\uC778(\uC2E4\uC2DC\uAC04)');
});
