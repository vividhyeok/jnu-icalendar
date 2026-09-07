# JNU Google Calendar

This project fetches a Jeju National University timetable and synchronizes it to Google Calendar.

**New users: read the [installation guide](./USER_GUIDE_KO.md).**

## Automatic semester range

Each run calculates the current semester in `Asia/Seoul`:
- spring: March 1 through August 31
- fall: September 1 through the following February

The query starts seven days before the semester start to catch corrections. This includes the examination period, so users do not maintain `START_YYYYMMDD` or `END_YYYYMMDD`.


## Safety

Puppeteer waits for iframe SSO completion instead of `networkidle2`. Portal JSON, dates, times, and range are validated before Calendar access.

Calendar writes stop before mutation when an existing managed result becomes empty or drops by more than half with at least five events lost. Only events marked `managedBy=jnu-google-calendar-sync` are deleted; user-created events are preserved.


## Runtime

Cloud Run runs one task and exits. Cloud Scheduler uses 08:17, 12:17, 16:17, and 20:17 in `Asia/Seoul`. Secrets are stored in Secret Manager. ADC issues a short-lived Calendar-scoped token without a JSON key.

Required: `PORTAL_USERNAME`, `PORTAL_PASSWORD`, `GOOGLE_CALENDAR_ID`. Optional: `DISCORD_WEBHOOK_URL`.


## Development

``@bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
``

See `scripts/deploy.sh`, `scripts/schedule.sh`, and [USER_GUIDE_KO.md](./USER_GUIDE_KO.md) for Cloud Shell deployment. See the [Cloud Run Scheduler documentation](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule).

[License](./LICENSE)