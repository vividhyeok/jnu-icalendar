import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const state = vi.hoisted(() => ({
  page: {goto:vi.fn(),waitForSelector:vi.fn(),type:vi.fn(),on:vi.fn(),off:vi.fn(),waitForFunction:vi.fn(),click:vi.fn(),setDefaultTimeout:vi.fn()},
  close:vi.fn(), launch:vi.fn(),
}));
vi.mock('puppeteer', () => ({default:{launch:state.launch}}));
vi.mock('../env',()=>({readConfig:()=>({username:'fixture',password:'fixture'})}));
import { fetchPortalLectures, isRetriablePortalError } from '../portalClient';
beforeEach(()=>{
  Object.values(state.page).forEach(fn=>fn.mockReset());
  state.page.waitForFunction.mockResolvedValue({jsonValue:async()=> 'authenticated'});
  state.launch.mockReset().mockResolvedValue({newPage:async()=>state.page,close:state.close});
  state.close.mockReset().mockResolvedValue(undefined);
});
afterEach(()=>{vi.restoreAllMocks();});
test('iframe login waits on authenticated DOM, then validates JSON and closes browser',async()=>{
  state.page.goto.mockResolvedValueOnce({}).mockResolvedValueOnce({ok:()=>true,text:async()=>'{"classTables":[]}'});
  expect(await fetchPortalLectures()).toEqual([]);
  expect(state.page.goto.mock.calls[0][1].waitUntil).toBe('domcontentloaded');
  expect(state.page.waitForFunction).toHaveBeenCalled();
  expect(state.close).toHaveBeenCalledOnce();
});
test('HTML payload is never treated as an empty timetable and browser closes',async()=>{
  state.page.goto.mockResolvedValueOnce({}).mockResolvedValueOnce({ok:()=>true,text:async()=>'<html>login</html>'});
  await expect(fetchPortalLectures()).rejects.toThrow('not JSON');
  expect(state.launch).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
});
test('schema errors do not retry and browser closes',async()=>{
  state.page.goto.mockResolvedValueOnce({}).mockResolvedValueOnce({ok:()=>true,text:async()=>'{}'});
  await expect(fetchPortalLectures()).rejects.toThrow('schema');
  expect(state.launch).toHaveBeenCalledOnce();expect(state.close).toHaveBeenCalledOnce();
});
test('credential failure is not retried',async()=>{
  state.page.waitForFunction.mockResolvedValue({jsonValue:async()=> 'rejected'});
  await expect(fetchPortalLectures()).rejects.toThrow('authentication failed');
  expect(state.launch).toHaveBeenCalledOnce();expect(state.close).toHaveBeenCalledOnce();
});
test.each(['Portal HTTP 503','Portal HTTP 429','Navigation timeout','net::ERR_CONNECTION_RESET'])('retries transient %s',message=>{
  expect(isRetriablePortalError(new Error(message))).toBe(true);
});
test.each(['Portal HTTP 403','Portal schema error','Portal authentication failed'])('does not retry %s',message=>{
  expect(isRetriablePortalError(new Error(message))).toBe(false);
});
