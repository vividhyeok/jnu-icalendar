// Offline regression for the built production image.
// Unit tests cover login form interactions; this smoke test focuses on the
// real Puppeteer/Chrome runtime plus the timetable-API verification path.
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

  const lectures = await fetchTimetableFromPage(page, {
    start: '20260901',
    end: '20260930',
    timeMin: '2026-09-01T00:00:00+09:00',
    timeMax: '2026-10-01T00:00:00+09:00',
  });

  if (!Array.isArray(lectures) || lectures.length !== 0) {
    throw new Error('Timetable API verification fixture failed');
  }

  console.info('Chrome timetable API verification smoke test passed');
} finally {
  await browser.close();
}
