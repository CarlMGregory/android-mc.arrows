import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);
const output = path.resolve('.local', 'rea-evidence');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9347'],
});
const cli = path.resolve('tools', 'rea', 'node_modules', 'rea-agents', 'scripts', 'rea.mjs');
async function rea(args, name) {
  const result = await run(process.execPath, [cli, ...args, '--format', 'json'], {
    timeout: 90000, maxBuffer: 16 * 1024 * 1024,
  });
  await writeFile(path.join(output, name), result.stdout);
  if (result.stderr) console.error(result.stderr);
  return JSON.parse(result.stdout);
}
try {
  const page = await browser.newPage();
  await page.goto('https://play.google.com/store/apps/details?id=com.oakever.arrows&hl=en_US', {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await page.getByRole('button', { name: 'See more information on About this game', exact: true }).click();
  const targets = await rea(['list-browser-targets', 'http://127.0.0.1:9347'], 'targets.json');
  const target = targets.normalized_result.targets.find(item =>
    item.url === page.url() && item.origin === 'https://play.google.com');
  if (!target) throw new Error('REA returned no target_id; inspect .local\\rea-evidence\\targets.json.');
  await rea(['inspect-web-page', 'http://127.0.0.1:9347', target.target_id,
    '--include-accessibility-text', '--observation-ms', '1000'], 'listing.json');
  console.log(`REA listing evidence saved under ${output}`);
} finally {
  await browser.close();
}
