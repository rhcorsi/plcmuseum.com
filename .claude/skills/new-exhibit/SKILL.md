---
name: new-exhibit
description: Scaffold a new exhibit JSON file from the schema with every unsourced field null, then hand it to the curator agent. Usage: /new-exhibit <id> "<name>" <manufacturer> <decade>
---
Steps:
1. Validate the id (lowercase, hyphens) and check that content/exhibits/<id>.json does not exist.
2. Create the file with all required keys from content/schema/exhibit.schema.json: identity from arguments, every spec and lifecycle field null, images empty, sources empty, verification.level "unverified" with unverified_fields listing every nullable fact path, text.pt and text.en placeholders with status "needs_review", review_status "draft".
3. Ask the owner for sources (URLs, publication numbers, books, interviews). Do not search for specs on your own and do not fill numbers from memory.
4. Delegate to the curator subagent with the provided sources.
5. Run `pnpm validate:content --only <id>` and report.
