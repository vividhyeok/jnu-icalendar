// Offline regression for the real Puppeteer/Chrome path, run inside the image.
import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { login, fetchTimetableFromPage } = require('../dist/portalClient.js');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const loginPage = await browser.newPage();
const timetablePage = await browser.newPage();
let authenticated = false;

async function installFixture(page) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());

    if (url.pathname === '/login.htm') {
      void request.respond({
        contentType: 'text/html',
        body:
          '<form action="/login-result" method="post" target="receiver">' +
          '<input id="userId" name="userId">' +
          '<input id="userPswd" name="userPswd">' +
          '<button type="submit">Login</button>' +
          '</form><iframe name="receiver"></iframe>',
      });
      return;
    }

    if (url.pathname === '/login-result') {
      authenticated = true;
      void request.respond({
        contentType: 'text/html',
        body: '<script>alert("informational notice");parent.location="/landing.htm"</script>',
      });
      return;
    }

    if (url.pathname === '/landing.htm') {
      void request.respond({
        contentType: 'text/html',
        body: '<h1>Authenticated fixture</h1>',
      });
      return;
    }

    if (url.pathname === '/api/patis/timeTable.jsp') {
      if (authenticated) {
        void request.respond({
          contentType: 'application/json',
          body: '{"classTables":[]}',
        });
      } else {
        void request.respond({
          contentType: 'text/html',
          body:
            '<html><form action="/login.htm">' +
            '<input id="userId"><input id="userPswd">' +
            '</form></html>',
        });
      }
      return;
    }

    void request.abort();
  });
}

await installFixture(loginPage);
await installFixture(timetablePage);

const dialogHandler = dialog => {
  void dialog.dismiss().catch(() => {});
};
loginPage.on('dialog', dialogHandler);

try {
  await login(loginPage, 'fixture-user', 'fixture-password');
  const lectures = await fetchTimetableFromPage(timetablePage, {
    start: '20260901',
    end: '20260930',
    timeMin: '2026-09-01T00:00:00+09:00',
    timeMax: '2026-10-01T00:00:00+09:00',
  });

  if (!Array.isArray(lectures) || lectures.length !== 0) {
    throw new Error('Timetable verification fixture failed');
  }

  console.info('Chrome iframe SSO smoke test passed using timetable API verification');
} finally {
  loginPage.off('dialog', dialogHandler);
  await browser.close();
}
