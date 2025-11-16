import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const requiredVariables = [
  'username',
  'password',
  'START_YYYYMMDD',
  'END_YYYYMMDD',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_CALENDAR_ID',
] as const;

for (const key of requiredVariables) {
  if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
}

const SYNC_INTERVAL_HOURS = Number(process.env.SYNC_INTERVAL_HOURS ?? '24');

if (Number.isNaN(SYNC_INTERVAL_HOURS) || SYNC_INTERVAL_HOURS < 0)
  throw new Error('SYNC_INTERVAL_HOURS must be zero or a positive number');

const username = process.env.username!;
const password = process.env.password!;
const START_YYYYMMDD = process.env.START_YYYYMMDD!;
const END_YYYYMMDD = process.env.END_YYYYMMDD!;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL!;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY!;
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

export {
  username,
  password,
  START_YYYYMMDD,
  END_YYYYMMDD,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_CALENDAR_ID,
  SYNC_INTERVAL_HOURS,
};
