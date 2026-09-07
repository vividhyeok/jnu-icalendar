import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
export function readConfig(env = process.env) {
  for (const key of ['PORTAL_USERNAME', 'PORTAL_PASSWORD', 'GOOGLE_CALENDAR_ID']) {
    if (!env[key]?.trim()) throw new Error('Missing environment variable: ' + key);
  }
  return {
    username: env.PORTAL_USERNAME!,
    password: env.PORTAL_PASSWORD!,
    calendarId: env.GOOGLE_CALENDAR_ID!.trim(),
  };
}
