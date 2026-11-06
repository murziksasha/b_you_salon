# Grill: Rate Limit 5-Hour Keepalive Automation with Toast Notifications
Date: 2026-10-20

## Intent
Automatically trigger a minimal-token prompt every 5 hours using the Antigravity CLI (`agy`) to cycle the 5-hour rolling rate limit window countdown, and deliver an interactive Windows Desktop Toast Notification with an audio chime informing the user whether the reset succeeded or failed, displaying the next reset time and actionable quota tips.

## Constraints
- Windows Native Desktop Notification: Uses Windows WinRT Toast Notification Manager with audio chime.
- Actionable tips: Provides helpful status tips depending on success ("Quota refreshed") or failure ("Check CLI auth / internet").
- Next reset timestamp: Calculates and shows the exact time for the upcoming 5-hour window.
- Token economy: Minimal prompt ("ping") on lowest cost model (`gemini-3.8-flash-low`) with reasoning effort set to low.
- Interactive desktop delivery: Task runs under interactive user logon so toasts display directly on the user's screen.
- Log record: All executions and notification dispatches recorded in `~/.gemini/antigravity/logs/keepalive.log`.

## Key decisions
- Decision: Use native Windows WinRT Toast Notification via PowerShell AppId. Reason: Native OS banner with action center integration and sound, zero third-party dependencies.
- Decision: Fallback to System.Windows.Forms NotifyIcon if WinRT encounters an environment restriction. Reason: Guarantees notification display under all desktop configurations.
- Decision: Configure Scheduled Task Principal to interactive logon (`-LogonType Interactive`). Reason: Ensures background task has desktop session access to present visual notifications to the user.

## Surfaced assumptions
- User is logged into Windows when the 5-hour mark is reached; if asleep, `StartWhenAvailable` triggers the notification immediately upon waking.
- PowerShell has access to WinRT notification APIs (standard on Windows 10/11).

## Out of scope
- Mobile/Telegram notifications (user selected Windows Desktop Toast).
- Modifying `B_YOU_For_You` repository files.
