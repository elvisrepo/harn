#!/usr/bin/env node
// browser-qa script: open a page, collect console/page/request errors, run
// DOM assertions, and take a screenshot. Exit 0 = all checks passed.
//
// Usage:
//   node scripts/qa.mjs <url> [flags]
//   --timeout <ms>            goto timeout (default 20000)
//   --wait <selector>         wait for this selector before checks
//   --assert <selector>       fail if absent
//   --reject <selector>       fail if present
//   --text <str>              fail if page body does not contain this text
//   --eval <js-expr>          run arbitrary code in the page (page.evaluate); result → report.eval
//   --login                   sign in first: fills #loginForm with --email/--password
//                             (fallback env ADMIN_EMAIL/ADMIN_PASSWORD), then waits to leave
//                             /login (or the --login-expect path)
//   --email <email> --password <secret>   credentials for --login (or env)
//   --login-expect <path>     require landing on this path after login (default /admin)
//   --shot <path.png>         full-page screenshot
//   --expect-error-free       fail on any console error / pageerror / failed request
//   --json                    machine-readable report on stdout
// Exit codes: 0 pass · 1 checks failed · 2 launch/usage error.

import { chromium } from 'playwright-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const url = args[0];
if (!url || !/^https?:\/\//.test(url)) {
  console.error('usage: node qa.mjs <url> [--timeout ms] [--wait sel] [--assert sel] [--reject sel] [--text str] [--eval js] [--login [--email e --password p] [--login-expect path]] [--shot path] [--expect-error-free] [--json]');
  process.exit(2);
}

const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const report = { url, ok: true, console: [], pageErrors: [], failedRequests: [], assertions: [], screenshot: null };

let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();

  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      report.console.push({ type: m.type(), text: m.text().slice(0, 300) });
    }
  });
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));
  page.on('requestfailed', (r) =>
    report.failedRequests.push({ url: r.url().slice(0, 160), error: (r.failure()?.errorText || '').slice(0, 120) })
  );

  await page.goto(url, { waitUntil: 'networkidle', timeout: Number(flag('timeout', '20000')) });

  // ---- optional sign-in flow ----------------------------------------------
  if (has('login')) {
    const email = flag('email', process.env.ADMIN_EMAIL ?? '');
    const password = flag('password', process.env.ADMIN_PASSWORD ?? '');
    if (!email || !password) {
      throw new Error('--login requires --email/--password or ADMIN_EMAIL / ADMIN_PASSWORD env');
    }
    await page.fill('input[type=email][name=email]', email);
    await page.fill('input[type=password][name=password]', password);
    await page.click('#loginForm button[type=submit]');
    const expect = flag('login-expect', '/admin');
    try {
      await page.waitForURL((u) => u.pathname.includes(expect), { timeout: 10000 });
      report.login = { ok: true, landed: page.url() };
    } catch {
      const snippet = await page.evaluate(() =>
        document.body.innerText.split('\n').filter((l) => l.trim()).slice(0, 8).join(' | ')
      );
      report.login = { ok: false, landed: page.url(), pageText: snippet.slice(0, 220) };
      report.assertions.push({ check: `login → ${expect}`, pass: false, detail: `landed on ${page.url()}; ${snippet.slice(0, 120)}` });
    }
  }

  // ---- arbitrary DOM/browser JS via page.evaluate --------------------------
  const evalExpr = flag('eval', null);
  if (evalExpr) {
    const safe = (v) => {
      try {
        return JSON.stringify(v) ?? String(v);
      } catch {
        return String(v == null ? 'undefined' : v);
      }
    };
    try {
      const val = await page.evaluate(`(${evalExpr})`);
      report.eval = { expr: evalExpr, result: safe(val) };
    } catch (e) {
      report.eval = { expr: evalExpr, error: String(e) };
      report.assertions.push({ check: `eval ${evalExpr}`, pass: false, detail: String(e).slice(0, 200) });
    }
  }

  const waitSel = flag('wait', null);
  if (waitSel) {
    try {
      await page.waitForSelector(waitSel, { timeout: 10000 });
      report.assertions.push({ check: `wait ${waitSel}`, pass: true, detail: 'found' });
    } catch {
      report.assertions.push({ check: `wait ${waitSel}`, pass: false, detail: 'selector not found' });
    }
  }

  const assertSel = flag('assert', null);
  if (assertSel) {
    const n = await page.locator(assertSel).count();
    report.assertions.push({ check: `assert ${assertSel}`, pass: n > 0, detail: `${n} match(es)` });
  }
  const rejectSel = flag('reject', null);
  if (rejectSel) {
    const n = await page.locator(rejectSel).count();
    report.assertions.push({ check: `reject ${rejectSel}`, pass: n === 0, detail: `${n} match(es)` });
  }
  const text = flag('text', null);
  if (text) {
    const body = await page.evaluate(() => document.body.innerText);
    report.assertions.push({ check: `text "${text}"`, pass: body.includes(text), detail: body.includes(text) ? 'found' : 'not found' });
  }
  report.landedUrl = page.url();

  const shot = flag('shot', null);
  if (shot) {
    await page.screenshot({ path: shot, fullPage: true });
    report.screenshot = shot;
  }

  let failed = report.assertions.filter((a) => !a.pass).length;
  if (has('expect-error-free')) {
    report.expectErrorFree = true;
    failed += report.console.length + report.pageErrors.length + report.failedRequests.length;
  }
  report.ok = failed === 0;
  report.summary = {
    assertions: report.assertions.length,
    failedAssertions: report.assertions.filter((a) => !a.pass).length,
    consoleWarnings: report.console.filter((c) => c.type === 'warning').length,
    consoleErrors: report.console.filter((c) => c.type === 'error').length,
    pageErrors: report.pageErrors.length,
    failedRequests: report.failedRequests.length,
  };
} catch (err) {
  report.ok = false;
  report.reportError = String(err).split('\n').slice(0, 3).join(' ');
} finally {
  if (browser) await browser.close();
}

if (has('json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`URL: ${url}${report.landedUrl && report.landedUrl !== url ? ` → ${report.landedUrl}` : ''}`);
  console.log(`assertions: ${report.summary?.assertions ?? '-'} · failed ${report.summary?.failedAssertions ?? '-'} | console: ${report.summary?.consoleErrors ?? '-'} err / ${report.summary?.consoleWarnings ?? '-'} warn | pageErrors: ${report.summary?.pageErrors ?? '-'} | failedRequests: ${report.summary?.failedRequests ?? '-'}`);
  for (const a of report.assertions ?? []) console.log(`  ${a.pass ? '✓' : '✗'} ${a.check} — ${a.detail}`);
  for (const c of report.console ?? []) console.log(`  console.${c.type}: ${c.text}`);
  for (const p of report.pageErrors ?? []) console.log(`  pageerror: ${p}`);
  for (const f of report.failedRequests ?? []) console.log(`  requestfailed: ${f.url} (${f.error})`);
  if (report.screenshot) console.log(`screenshot: ${report.screenshot}`);
  if (report.reportError) console.error(`launch error: ${report.reportError}`);
}

process.exit(report.ok ? 0 : 1);