import { GoogleAuth, Impersonated, type AuthClient } from 'google-auth-library';
const scope = 'https://www.googleapis.com/auth/calendar.events';
let client: AuthClient | undefined;
async function requestAccessToken() {
  if (!client) {
    const target = process.env.CALENDAR_SERVICE_ACCOUNT;
    const source = await new GoogleAuth({
      scopes: target ? ['https://www.googleapis.com/auth/cloud-platform'] : [scope],
      clientOptions: { transporterOptions: { timeout: 20_000, retry: false } },
    }).getClient();
    client = target ? new Impersonated({
      sourceClient: source,
      targetPrincipal: target,
      targetScopes: [scope],
      lifetime: 600,
      transporterOptions: { timeout: 20_000, retry: false },
    }) : source;
  }
  const result = await client.getAccessToken();
  if (!result.token) throw new Error('Google authentication returned no token');
  return result.token;
}

export async function getAccessToken() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([requestAccessToken(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Google authentication timeout')), 30_000);
    })]);
  } catch (error) {
    const status = (error as {response?: {status?: unknown}})?.response?.status;
    if (typeof status === 'number' && status >= 400 && status <= 599) {
      throw new Error('Google authentication failed (HTTP ' + status + ')');
    }
    if (error instanceof Error && error.message === 'Google authentication timeout') throw error;
    throw new Error('Google authentication failed; check ADC and token permissions');
  } finally { clearTimeout(timer); }
}
