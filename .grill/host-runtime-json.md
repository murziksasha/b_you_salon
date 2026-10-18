# Keep host runtime JSON out of Git

## Intent

The PM2 host can `git pull` / `npm run update` without modify/delete conflicts on `data/*.json`, and the live files on that machine stay intact.

## Constraints

- Untrack every runtime `data/*.json`. Keep `data/site.seed.json` in Git.
- `.gitignore` already ignores `/data/*.json` except that seed; ignore does not untrack a file that was committed earlier.
- The dev folder (`F:\SSD PROJECT\b_you_salon`, branch `adminPanelFeat`) is not the PM2 checkout and has no merge in progress. Do not `reset`, `merge --abort`, or delete data here.
- The host's own commits are dropped once, by hand, on that machine, after a backup. `npm run update` must never `git reset --hard` by itself.
- Land the repo change on `dev` (host `DEPLOY_BRANCH`), not only on `adminPanelFeat`.
- No history rewrite and no force-push. If `origin/dev` still contains live session or lead files after the delete commit `949125e`, stop and report before pushing.
- Guard via `scripts/check-tracked-data.mjs` prepended to `npm run check`.

## Key decisions

- Decision: untrack runtime JSON files from git while keeping `data/site.seed.json` tracked. Reason: runtime state (`site.json`, `leads.json`, `orders.json`, `admin-activity.json`, `admin-sessions.json`, `feed-schedule.json`) is modified continuously by PM2 on the host; tracking it causes merge and modify/delete conflicts upon pull.
- Decision: perform one-time reset on the host manually, never automatically inside `update-app.ps1`. Reason: automated `git reset --hard` could destroy uncommitted host data if backup failed; manual step ensures human oversight and verification of backup.
- Decision: in `update-app.ps1`, detect if dirty tracked paths are only runtime `data/*.json` (excluding `site.seed.json`) and restore them from HEAD prior to `git pull --ff-only`, then restore live bytes from backup post-pull. Reason: allows fast-forward to delete old tracked files cleanly while immediately restoring PM2 runtime data from the pre-update backup.
- Decision: on pull failure in `update-app.ps1`, immediately restore runtime JSON from the pre-update backup and abort. Reason: leaves the host application in a working, non-corrupted state with all live data preserved.
- Decision: prepend `check-tracked-data.mjs` to `npm run check`. Reason: fails the build in CI and local checks if any runtime JSON file under `data/` is accidentally committed.

## Surfaced assumptions

- `origin/dev` is the target deploy branch for the PM2 host (`DEPLOY_BRANCH=dev`).
- Commit `949125e` on `origin/dev` already deleted `data/admin-activity.json` and `data/admin-sessions.json`, leaving `data/site.seed.json` as the only tracked file in `data/`.
- PM2 host was blocked on `git pull` due to modify/delete conflicts and diverged local commits created directly on the host machine.
- Stopping PM2 processes (`byou`, `byou-telegram`) prior to the manual recovery prevents background writes to `data/*.json` during file copying.

## Out of scope

- Rewriting git history on remote branches.
- Modifying the running dev workspace `F:\SSD PROJECT\b_you_salon` on branch `adminPanelFeat`.
- Running `git reset --hard` or `git merge --abort` automatically inside `scripts/update-app.ps1`.
- Committing any runtime JSON files under `data/`.

