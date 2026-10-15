---
name: translate-exhibit
description: Generate es, de and it text blocks for an exhibit from its pt or en master using the glossary, marked as machine translation. Usage: /translate-exhibit <id> [langs]
---
1. Read content/exhibits/<id>.json and content/glossary.json.
2. Delegate to the i18n subagent for the requested languages (default: es, de, it). It must keep product names, numbers and units untouched and set status "machine".
3. Run `pnpm validate:content --only <id>` and report which languages were added and which glossary terms were applied.
