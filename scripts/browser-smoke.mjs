// Offline regression for the real Puppeteer/Chrome path, run inside the image.
import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { login, fetchTimetableFromPage } = require('../dist/portalClient.js');

const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 45_000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const loginPage = await browser.newPage();
const timetablePage = await browser.newPage();

await loginPage.setRequestInterception(true);
loginPage.on('request', request => {
  const url = new URL(request.url());

  if (url.pathname === '/login.htm') {
    void request.respond({
      contentType: 'text/html',
      body:
        '<form onsubmit="document.body.dataset.submitted=\'yes\'; return false;">' +
        '<input id="userId" name="userId">' +
        '<input id="userPswd" name="userPswd">' +
        '<button type="submit">Login</button>' +
        '</form>',
    });
    return;
  }

  void request.abort();
});

await timetablePage.setRequestInterception(true);
timetablePage.on('request', request => {
  const url = new URL(request.url());

  if (url.pathname === '/api/patis/timeTable.jsp') {
    void request.respond({
      contentType: 'application/json',
      body: '{"classTables":[]}',
    });
    return;
  }

  void request.abort();
});

try {
  await login(loginPage, 'fixture-user', 'fixture-password');

  const submitted = await loginPage.$eval(
    'body',
    body => body.dataset.submitted,
  );
  if (submitted !== 'yes') throw new Error('Login form fixture was not submitted');

  const lectures = await fetchTimetableFromPage(timetablePage, {
    start: '20260901',
    end: '20260930',
    timeMin: '2026-09-01T00:00:00+09:00',
    timeMax: '2026-10-01T00:00:00+09:00',
  });

  if (!Array.isArray(lectures) || lectures.length !== 0) {
    throw new Error('Timetable verification fixture failed');
  }

  if (loginPage.url() === 'https://portal.jejunu.ac.kr/index.htm') {
    throw new Error('Smoke fixture unexpectedly depends on /index.htm');
  }

  console.info('Chrome portal login/API smoke test passed without /index.htm dependency');
} finally {
  await browser.close();
}
