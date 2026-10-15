---
name: validate-content
description: Run the content validator (schemas, sources, image licenses, ids) and summarize what blocks publication. Usage: /validate-content [exhibit-id]
---
Run `node scripts/validate-content.mjs` (or `pnpm validate:content`). If an exhibit id is given, pass `--only <id>`.
Summarize: schema errors (file, path, message), publication blockers (missing sources, unverified fields, missing or unlicensed images, text status), and warnings. Propose the smallest fix for each. Do not fix facts by guessing; route factual gaps to the owner.
