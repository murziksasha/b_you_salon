/**
 * pm2 process file for B_You (no Docker).
 * Port is read from .env PORT=… or process.env.PORT (default 3000).
 * Start via: npm run pm2:setup  OR  pm2 start ecosystem.config.cjs
 *
 * Apps:
 *   byou           — Next.js
 *   byou-telegram  — admin Telegram bot (long-poll getUpdates)
 */
const fs = require("fs");
const path = require("path");

function readDotEnv() {
  const out = {};
  try {
    const text = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    // no .env
  }
  return out;
}

const fileEnv = readDotEnv();

function readPort() {
  if (process.env.PORT && /^\d+$/.test(String(process.env.PORT))) {
    return String(process.env.PORT);
  }
  if (fileEnv.PORT && /^\d+$/.test(String(fileEnv.PORT))) {
    return String(fileEnv.PORT);
  }
  return "3000";
}

const port = readPort();
const sharedEnv = {
  ...fileEnv,
  NODE_ENV: "production",
  PROJECT_ROOT: __dirname,
  DATA_DIR: fileEnv.DATA_DIR || path.join(__dirname, "data"),
  UPLOADS_DIR: path.join(__dirname, "public", "uploads"),
  PORT: port,
};

module.exports = {
  apps: [
    {
      name: "byou",
      cwd: __dirname,
      script: path.join("node_modules", "next", "dist", "bin", "next"),
      args: `start -H 0.0.0.0 -p ${port}`,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "5s",
      env: sharedEnv,
    },
    {
      name: "byou-telegram",
      cwd: __dirname,
      script: path.join("node_modules", "tsx", "dist", "cli.mjs"),
      args: "scripts/telegram-bot.ts",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "5s",
      env: sharedEnv,
    },
  ],
};
