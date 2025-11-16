import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';
import { Value } from '@sinclair/typebox/value';

import {
  END_YYYYMMDD,
  START_YYYYMMDD,
  password,
  username,
} from './env';
import { Lecture, ResponseTObject } from './response';

const LOGIN_URL = 'https://portal.jejunu.ac.kr/login.htm';
const TIMETABLE_ENDPOINT =
  'https://portal.jejunu.ac.kr/api/patis/timeTable.jsp';

async function login(page: Page) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });
  await page.type('#userId', username, { delay: 20 });
  await page.type('#userPswd', password, { delay: 20 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('[type="submit"]'),
  ]);
}

export async function fetchPortalLectures(): Promise<Lecture[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await login(page);

    const url = `${TIMETABLE_ENDPOINT}?sttLsnYmd=${START_YYYYMMDD}&endLsnYmd=${END_YYYYMMDD}`;
    const response = await page.goto(url, { waitUntil: 'networkidle2' });

    if (!response || !response.ok()) {
      throw new Error('Failed to fetch timetable payload from the portal');
    }

    const { classTables } = Value.Parse(
      ResponseTObject,
      await response.json()
    );

    return classTables;
  } finally {
    await browser.close();
  }
}
