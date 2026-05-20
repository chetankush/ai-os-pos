import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const EMAIL = 'admin@testpos.com';
const PASSWORD = 'Test@1234';
const SHOTS = '/tmp/sangam-shots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, cond) => {
  results.push([cond ? 'PASS' : 'FAIL', name]);
  console.log(`${cond ? '✓' : '✗'} ${name}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(20000);

try {
  // 1. Login page (light mode default)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
  const isDarkAtStart = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  );
  ok('login page defaults to LIGHT mode (no .dark)', !isDarkAtStart);
  ok('login shows "Welcome back"', await page.getByText('Welcome back').isVisible());

  // 2. Log in
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/cafes', { timeout: 20000 });
  await page.screenshot({ path: `${SHOTS}/02-dashboard.png` });
  ok('redirected to /cafes after login', page.url().includes('/cafes'));
  ok('dashboard shows seeded cafe "Tapri Central"', await page.getByText('Tapri Central').first().isVisible());

  // 3. Theme toggle → dark
  await page.getByRole('button', { name: /switch to dark mode/i }).click();
  await page.waitForTimeout(400);
  const isDarkNow = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  );
  ok('theme toggle switches to DARK', isDarkNow);
  await page.screenshot({ path: `${SHOTS}/03-dashboard-dark.png` });
  // toggle back to light
  await page.getByRole('button', { name: /switch to light mode/i }).click();
  await page.waitForTimeout(300);
  const backToLight = await page.evaluate(() =>
    !document.documentElement.classList.contains('dark'),
  );
  ok('theme toggle switches back to LIGHT', backToLight);

  // 4. Open the cafe → dashboard detail
  await page.getByText('Tapri Central').first().click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `${SHOTS}/04-cafe.png` });

  // 5. Menu
  await page.getByRole('link', { name: /menu/i }).first().click();
  await page.waitForLoadState('networkidle');
  ok('menu shows a seeded item (Masala Chai)', await page.getByText('Masala Chai').first().isVisible());
  await page.screenshot({ path: `${SHOTS}/05-menu.png` });

  // 6. Settle tool
  await page.goto(`${BASE}/settle`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /fill sample data/i }).click();
  await page.getByRole('button', { name: /find disputable money/i }).click();
  await page.waitForTimeout(1500);
  ok('settle shows a "disputable" result', await page.getByText(/disputable/i).first().isVisible());
  await page.screenshot({ path: `${SHOTS}/06-settle.png` });
} catch (err) {
  console.error('SCRIPT ERROR:', err.message);
  await page.screenshot({ path: `${SHOTS}/error.png` }).catch(() => {});
  results.push(['FAIL', `script error: ${err.message}`]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n=== ${results.length - failed}/${results.length} passed · screenshots in ${SHOTS} ===`);
process.exit(failed ? 1 : 0);
