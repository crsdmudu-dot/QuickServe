#!/usr/bin/env node
// qa/scripts/stability.mjs — QA-infrastructure stability cycle (Gate B).
//
// Runs the Chromium suite 2× serial + 1× parallel and fails (non-zero exit) on
// the first failing cycle. Cross-platform (Node), so it works under PowerShell
// and Bash alike — a raw shell `for` loop would not.
//
// Uses spawnSync with an argument array (no shell string interpolation). All
// arguments are static constants below.
import { spawnSync } from 'node:child_process';

const cycles = [
  ['serial-1', ['playwright', 'test', '--project=chromium', '--workers=1']],
  ['serial-2', ['playwright', 'test', '--project=chromium', '--workers=1']],
  ['parallel-1', ['playwright', 'test', '--project=chromium']],
];

for (const [label, args] of cycles) {
  console.log(`\n=== stability cycle: ${label} ===`);
  // `npx` is a shell script on Windows, so shell:true is required there to
  // resolve it; the args stay an array (no command-string interpolation).
  const result = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`\nstability: cycle "${label}" failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nstability: all cycles passed');
