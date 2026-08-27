/**
 * Rotate ADMIN_PASSWORD and/or SESSION_SECRET in project .env
 *
 * Usage:
 *   node scripts/rotate-secrets.mjs
 *     → only new SESSION_SECRET
 *
 *   node scripts/rotate-secrets.mjs --password
 *     → ask for new ADMIN_PASSWORD (hidden) + new SESSION_SECRET
 *
 *   node scripts/rotate-secrets.mjs --password "YourNewPassword"
 *     → set password from CLI + new SESSION_SECRET
 *
 *   node scripts/rotate-secrets.mjs --password-only
 *     → only password (interactive)
 *
 *   node scripts/rotate-secrets.mjs --password-only "YourNewPassword"
 *     → only password from CLI
 *
 * After: restart the app (npm start / docker / pm2).
 */

import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

function parseArgs(argv) {
  const out = { password: false, passwordOnly: false, value: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--password' || a === '-p') {
      out.password = true;
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        out.value = next;
        i++;
      }
    } else if (a === '--password-only') {
      out.passwordOnly = true;
      out.password = true;
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        out.value = next;
        i++;
      }
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function newSessionSecret() {
  return randomBytes(32).toString('hex');
}

function setEnvKey(filePath, key, value) {
  let text = readFileSync(filePath, 'utf8');
  // normalize line endings for write
  const lines = text.split(/\r?\n/);
  let found = false;
  const out = lines.map((line) => {
    if (/^\s*#/.test(line) || !line.trim()) return line;
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    if (out.length && out[out.length - 1] !== '') out.push('');
    out.push(`${key}=${value}`);
  }
  // keep trailing newline
  writeFileSync(filePath, out.join('\n').replace(/\n*$/, '\n'), 'utf8');
}

function questionHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    // mute echo
    const stdin = process.stdin;
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.removeListener('data', onData);
          break;
        default:
          // clear echoed char
          if (stdin.isTTY) {
            process.stdout.clearLine?.(0);
            process.stdout.cursorTo?.(0);
            process.stdout.write(prompt + '*'.repeat(rl.line.length));
          }
          break;
      }
    };
    if (stdin.isTTY) stdin.on('data', onData);
    rl.question(prompt, (answer) => {
      if (stdin.isTTY) stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node scripts/rotate-secrets.mjs
  node scripts/rotate-secrets.mjs --password
  node scripts/rotate-secrets.mjs --password "NewPass"
  node scripts/rotate-secrets.mjs --password-only
  node scripts/rotate-secrets.mjs --password-only "NewPass"`);
    process.exit(0);
  }

  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
      console.log('Created .env from .env.example');
    } else {
      console.error('.env not found:', envPath);
      process.exit(1);
    }
  }

  const changed = [];

  if (!args.passwordOnly) {
    const secret = newSessionSecret();
    setEnvKey(envPath, 'SESSION_SECRET', secret);
    changed.push('SESSION_SECRET');
    console.log('OK  SESSION_SECRET updated (64-char hex)');
  } else {
    console.log('SKIP SESSION_SECRET');
  }

  if (args.password) {
    let pwd = args.value;
    if (!pwd) {
      const a = await questionHidden('New ADMIN_PASSWORD: ');
      const b = await questionHidden('Repeat ADMIN_PASSWORD: ');
      if (a !== b) {
        console.error('Passwords do not match');
        process.exit(1);
      }
      pwd = a;
    }
    if (!pwd || !pwd.trim()) {
      console.error('Empty password');
      process.exit(1);
    }
    if (pwd.length < 10) {
      console.warn('Warning: password shorter than 10 characters');
    }
    setEnvKey(envPath, 'ADMIN_PASSWORD', pwd.trim());
    changed.push('ADMIN_PASSWORD');
    console.log('OK  ADMIN_PASSWORD updated');
  } else {
    console.log('SKIP ADMIN_PASSWORD (use --password to change)');
  }

  console.log('');
  console.log('File:', envPath);
  if (!changed.length) {
    console.log('Nothing changed.');
    process.exit(0);
  }
  console.log('Changed:', changed.join(', '));
  console.log(`
NEXT STEPS:
  1. Restart the app:
       npm run build
       npm start
  2. Login at /admin/login with the NEW password
  3. After SESSION_SECRET change all old sessions are invalid
  4. Do not commit .env to git
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
