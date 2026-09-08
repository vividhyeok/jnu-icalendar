// Offline regression for the built production image.
// This verifies the real Puppeteer/Chrome runtime plus same-origin timetable
// verification from a single browser page without contacting the real portal.
import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { fetchTimetableFromPage } = require('../dist/portalClient.js');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);

  page.on('request', request => {
    const url = new URL(request.url());

    if (url.pathname === '/fixture') {
      void request.respond({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body>fixture</body></html>',
      });
      return;
    }

    if (url.pathname === '/api/patis/timeTable.jsp') {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: '{"classTables":[]}',
      });
      return;
    }

    void request.abort();
  });

  // Put the page on the real portal origin so browser fetch() is same-origin.
  await page.goto('https://portal.jejunu.ac.kr/fixture', {
    waitUntil: 'domcontentloaded',
    timeout: 10_000,
  });

  const lectures = await fetchTimetableFromPage(page, {
    start: '20260901',
    end: '20260930',
    timeMin: '2026-09-01T00:00:00+09:00',
    timeMax: '2026-10-01T00:00:00+09:00',
  });

  if (!Array.isArray(lectures) || lectures.length !== 0) {
    throw new Error('Timetable API verification fixture failed');
  }

  console.info('Chrome single-page timetable API verification smoke test passed');
} finally {
  await browser.close();
}
