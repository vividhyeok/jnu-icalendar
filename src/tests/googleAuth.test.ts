import {afterEach,expect,test,vi} from 'vitest';
const state=vi.hoisted(()=>({auth:vi.fn(),impersonated:vi.fn(),getClient:vi.fn(),getAccessToken:vi.fn()}));
vi.mock('google-auth-library',()=>({
  GoogleAuth:class {constructor(options:unknown){state.auth(options);} getClient=state.getClient;},
  Impersonated:class {constructor(options:unknown){state.impersonated(options);} getAccessToken=state.getAccessToken;},
}));
afterEach(()=>{vi.resetModules();vi.unstubAllEnvs();vi.clearAllMocks();});
test('runtime ADC mints short-lived Calendar-scoped token with no private key',async()=>{
  vi.stubEnv('CALENDAR_SERVICE_ACCOUNT','runtime@example.iam.gserviceaccount.com');
  state.getClient.mockResolvedValue({});
  state.getAccessToken.mockResolvedValue({token:'fixture'});
  const {getAccessToken}=await import('../googleAuth');
  expect(await getAccessToken()).toBe('fixture');
  expect(state.impersonated).toHaveBeenCalledWith(expect.objectContaining({
    targetPrincipal:'runtime@example.iam.gserviceaccount.com',lifetime:600,
    targetScopes:['https://www.googleapis.com/auth/calendar.events'],
  }));
  expect(state.auth).toHaveBeenCalledWith(expect.objectContaining({
    clientOptions:{transporterOptions:{timeout:20000,retry:false}},
  }));
});
test('local ADC remains supported without a target',async()=>{
  vi.stubEnv('CALENDAR_SERVICE_ACCOUNT','');
  state.getClient.mockResolvedValue({getAccessToken:async()=>({token:'local'})});
  const {getAccessToken}=await import('../googleAuth');
  expect(await getAccessToken()).toBe('local');
  expect(state.impersonated).not.toHaveBeenCalled();
});
