/**
 * pm2 process file for ProperService (no Docker).
 * Port is read from .env PORT=… or process.env.PORT (default 3000).
 * Start via: npm run pm2:setup  OR  pm2 start ecosystem.config.cjs
 */
const fs = require("fs");
const path = require("path");

function readPort() {
  if (process.env.PORT && /^\d+$/.test(String(process.env.PORT))) {
    return String(process.env.PORT);
  }
  try {
    const envPath = path.join(__dirname, ".env");
    const text = fs.readFileSync(envPath, "utf8");
    const m = text.match(/^\s*PORT\s*=\s*(\d+)\s*$/m);
    if (m) return m[1];
  } catch {
    // no .env — use default
  }
  return "3000";
}

const port = readPort();

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
      env: {
        NODE_ENV: "production",
        PORT: port,
        // Durable uploads on the project tree (not under .next/)
        PROJECT_ROOT: __dirname,
        UPLOADS_DIR: path.join(__dirname, "public", "uploads"),
      },
    },
  ],
};
