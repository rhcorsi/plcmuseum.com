# Security policy

PLC Museum is a static site plus one small API on Cloudflare. We take reports seriously and fix quickly.

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

- Preferred: GitHub private vulnerability reporting (Security tab → "Report a vulnerability").
- Alternative: e-mail `security@plcmuseum.com`.

Include steps to reproduce, the affected URL or file, and your contact. You will get an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for confirmed issues. We credit reporters in `docs/CHANGELOG.md` unless you prefer otherwise.

## Scope

- The website `plcmuseum.com` and its Worker (`/api/stories`, `/api/health`).
- This repository's build and CI configuration.

Out of scope: third-party sites we link to, social accounts, and denial-of-service against Cloudflare's edge.

## Data and privacy requests

To correct or remove a published story or image credit, write to `hello@plcmuseum.com`. See the privacy page on the site for what we store and for how long.

## What we never store in this repository

Secrets, tokens, API keys, contributor contact details, pending story submissions, or permission e-mails. If you find any of these in the repository or its history, report it as a vulnerability; we rotate first and clean history second (see `docs/OPEN_SOURCE.md`).
