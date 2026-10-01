import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

export const BASE_URL = process.env.THEMOVE_URL ?? 'http://127.0.0.1:5317';

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Starts Vite unless one is already serving BASE_URL. Returns a stop() function. */
export async function ensureServer() {
  if (await isUp(BASE_URL)) return () => {};
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5317', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    if (await isUp(BASE_URL)) return () => child.kill();
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`Vite did not start on ${BASE_URL}`);
}

export async function openPage(path, { width = 1280, height = 720 } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE_URL}${path}`);
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  } catch (err) {
    await browser.close();
    throw new Error(`${path} never became ready: ${errors.join(' | ') || err.message}`);
  }
  return { browser, page, errors };
}
