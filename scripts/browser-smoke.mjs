// Offline regression for the real Puppeteer/Chrome path, run inside the image.
import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { login } = require('../dist/portalClient.js');
const browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/login.htm') {
      void request.respond({contentType:'text/html',body:
        '<form action="/login-result" method="post" target="receiver"><input id="userId" name="userId"><input id="userPswd" name="userPswd"><button type="submit">Login</button></form><iframe name="receiver"></iframe>'});
    } else if (url.pathname === '/login-result') {
      void request.respond({contentType:'text/html',body:'<script>parent.location="/index.htm"</script>'});
    } else if (url.pathname === '/index.htm') {
      void request.respond({contentType:'text/html',body:'<h1>Authenticated fixture</h1><img src="/never-finishes">'});
    } else if (url.pathname !== '/never-finishes') {
      void request.abort();
    }
    // Deliberately keep an image request pending: network idle must not be required.
  });
  await login(page,'fixture-user','fixture-password');
  if (page.url() !== 'https://portal.jejunu.ac.kr/index.htm') throw new Error('Login fixture failed');
  console.info('Chrome iframe SSO smoke test passed without network idle');
} finally {
  await browser.close();
}
