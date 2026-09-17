#!/usr/bin/env node
// Generic default-parser wrapper for the sensors sidecar: runs a command,
// emits the minimal SensorReading schema (exit code is the verdict).
// Per-sensor detail lives in the native parsers (eslint/semgrep/depcruise);
// this covers the ones without one. No dependencies.
import { spawnSync } from 'node:child_process';

const [name, ...cmd] = process.argv.slice(2);
if (!name || !cmd.length) {
  console.error('usage: wrap.mjs <name> -- <command...>');
  process.exit(2);
}
const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' });
const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
const failLines = out
  .split('\n')
  .filter((l) => /✖|error|Error|fail [1-9]|AssertionError/i.test(l))
  .slice(-8);
console.log(
  JSON.stringify({
    findings: r.status === 0 ? [] : failLines.map((message) => ({ message: message.slice(0, 200), severity: 'error' })),
  }),
);
