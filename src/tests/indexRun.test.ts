import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch:vi.fn(), sync:vi.fn() }));
vi.mock('../portalClient', () => ({ fetchPortalLectures: mocks.fetch }));
vi.mock('../googleCalendar', () => ({ syncGoogleCalendar: mocks.sync }));
import { runSync } from '../sync';
beforeEach(() => {
  vi.stubEnv('PORTAL_USERNAME','fixture'); vi.stubEnv('PORTAL_PASSWORD','fixture');
  vi.stubEnv('GOOGLE_CALENDAR_ID','fixture');
  vi.stubEnv('DISCORD_WEBHOOK_URL','');
  mocks.fetch.mockReset().mockResolvedValue([]);
  mocks.sync.mockReset().mockResolvedValue({inserted:0,deleted:0});
  vi.spyOn(console,'info').mockImplementation(()=>{});
  vi.spyOn(console,'error').mockImplementation(()=>{});
  vi.spyOn(console,'warn').mockImplementation(()=>{});
});
afterEach(() => {vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
test('portal failure returns nonzero without any Calendar request', async () => {
  mocks.fetch.mockRejectedValue(new Error('secret-cookie'));
  expect(await runSync()).toBe(1);
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-cookie');
});
test('no changes means no Discord request', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
  vi.stubEnv('DISCORD_WEBHOOK_URL','https://discord.com/api/webhooks/test/fixture');
  expect(await runSync()).toBe(0); expect(fetch).not.toHaveBeenCalled();
});
test('Discord failure leaves successful sync successful', async () => {
  vi.stubEnv('DISCORD_WEBHOOK_URL','https://discord.com/api/webhooks/test/fixture');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('secret-url')));
  mocks.sync.mockResolvedValue({inserted:1,deleted:0});
  expect(await runSync()).toBe(0);
});
test('notification failure cannot replace Calendar failure', async () => {
  vi.stubEnv('DISCORD_WEBHOOK_URL','https://discord.com/api/webhooks/test/fixture');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('secret-url')));
  mocks.sync.mockRejectedValue(new Error('calendar failure'));
  expect(await runSync()).toBe(1);
});
test('missing config identifies field and never fetches portal', async () => {
  vi.stubEnv('PORTAL_PASSWORD','');
  expect(await runSync()).toBe(1);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining('PORTAL_PASSWORD'));
});
