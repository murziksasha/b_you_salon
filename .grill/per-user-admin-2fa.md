# Grill: per-user admin 2FA

Date: 2026-10-20

## Intent

Each admin account has its own TOTP on/off. The owner's or env super-admin 2FA never applies to other users. When a user's 2FA is on, login and sensitive actions require password + TOTP. When it is off, password only.

## Constraints

- A file user with 2FA off logs in with a password only, even if owner or global 2FA is on.
- Self-service on/off stays in Settings. The owner can only reset (wipe) a lost-phone 2FA.
- Enforcement is login plus sensitive actions, not every CMS save.
- Sensitive prompt is password and TOTP every time. No 5-minute remember. 2FA off means password only.
- Global TOTP (`admin-totp.json` / `ADMIN_TOTP_SECRET`) applies only to env / break-glass login.
- `ADMIN_REQUIRE_TOTP` is ignored for file users. Env login still uses global TOTP if that secret exists.
- Backup restore joins the sensitive list: password always, plus TOTP if the actor has 2FA on.
- Every signed-in admin, including operators, can open `/admin/settings` for their own 2FA. Site, users, and backup cards stay capability-gated.

## Key decisions

- Decision: identity is `viaEnvPassword` from `authenticateLogin`, not break-glass mode alone. Reason: `ADMIN_ENV_LOGIN=always` is also an env login. Alternative considered: only `isBreakglassActive()`.
- Decision: drop `PERSONAL_TOTP_REQUIRED`. A file user with no personal secret is allowed through. Reason: per-user off must win over the global flag. Alternative considered: keep the flag as a force-on switch.
- Decision: one resolver, `resolveActorTotpSecret`, for login's pure helper inputs and for `verifySensitiveReauth`. Reason: login and step-up must not drift. Alternative considered: duplicate the if in each route.
- Decision: `/admin/settings` is allowed for every signed-in role without granting the `settings` capability. Reason: the capability also opens the site form. Alternative considered: give every role `settings`.
- Decision: `GET /api/auth` returns `totpEnabled`, and the TOTP panel writes it back into `AdminRoleContext` after enable or disable. Reason: users and backup fields must appear before the next sensitive call.
- Decision: JSON import stays a browser `confirm()` only. Reason: called out of scope. Alternative considered: the same password + TOTP gate as restore.

## Surfaced assumptions

- Enable and confirm happen only while the actor has no secret, so the enrollment code is not also a step-up code.
- Disable sends the current code in `code`. The step-up helper checks that same field, then the existing disable check runs again.
- Cron still cannot restore. Snapshot create, download, and delete stay ungated.
- The dashboard 2FA line is this actor's status. A file user is not marked on because a global secret exists.

## Out of scope

- Backup codes, SMS, email or Telegram OTP, passkeys.
- Forcing 2FA on a role.
- Copying the global secret into users (`migrate:totp` stays report/backup).
- JSON import reauth.
- TOTP on ordinary CMS saves.
