import { expect, test } from 'vitest';
import { readConfig } from '../env';

test('trims surrounding whitespace from secret-backed environment values', () => {
  const config = readConfig({
    PORTAL_USERNAME: '  fixture-user\n',
    PORTAL_PASSWORD: 'fixture-password\n',
    GOOGLE_CALENDAR_ID: ' fixture-calendar \n',
  });

  expect(config).toEqual({
    username: 'fixture-user',
    password: 'fixture-password',
    calendarId: 'fixture-calendar',
  });
});

test('still rejects blank required values after trimming', () => {
  expect(() => readConfig({
    PORTAL_USERNAME: 'fixture-user',
    PORTAL_PASSWORD: '   \n',
    GOOGLE_CALENDAR_ID: 'fixture-calendar',
  })).toThrow('Missing environment variable: PORTAL_PASSWORD');
});
