import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const pages = [
  { name: 'home', url: 'http://localhost:3000/' },
  { name: 'login', url: 'http://localhost:3000/login' },
  { name: 'register', url: 'http://localhost:3000/register' },
  { name: 'dashboard', url: 'http://localhost:3000/dashboard' },
  { name: 'database-schema', url: 'http://localhost:3000/database-schema' },
];

const outDir = path.resolve('docs/analysis/screenshots');
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

for (const p of pages) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  try {
    await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 30000 });
    const file = path.join(outDir, `${p.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`✓ ${p.name} -> ${file}`);
  } catch (e) {
    console.log(`✗ ${p.name}: ${e.message}`);
  } finally {
    await page.close();
  }
}
await browser.close();
