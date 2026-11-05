#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

let output = '';
try {
  output = execSync('git ls-files -- data', {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (err) {
  console.error('check-tracked-data: failed to run git ls-files', err);
  process.exit(1);
}

const trackedDataFiles = output
  .split(/\r?\n/)
  .map((line) => line.trim().replace(/\\/g, '/'))
  .filter(Boolean);

const expected = ['data/site.seed.json'];
const isMatch =
  trackedDataFiles.length === 1 && trackedDataFiles[0] === expected[0];

if (!isMatch) {
  console.error('ERROR: Untracked data rule violation!');
  console.error(
    `Expected only [${expected.join(', ')}] to be tracked under data/.`
  );
  console.error('Found tracked paths:', trackedDataFiles);
  process.exit(1);
}

console.log('OK: Only data/site.seed.json is tracked under data/.');

