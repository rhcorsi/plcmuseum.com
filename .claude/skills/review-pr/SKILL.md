---
name: review-pr
description: Review a pull request with the reviewer and security-reviewer subagents, then write the verdict into the task file. Usage: /review-pr <number-or-branch>
---
1. Fetch the PR diff (`gh pr diff <n>` or `git diff main...<branch>`), the PR description and the task file it references.
2. Run the checks: `pnpm validate:content && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
3. Delegate to the reviewer subagent; if the diff touches worker/, wrangler.jsonc, headers, .github/, package.json or any form or storage, also delegate to security-reviewer.
4. Consolidate one verdict (approve, request changes, block) with file:line findings. Write it under "Review (Claude Code)" in the task file and as a PR comment. Never merge on your own if the verdict is not approve, and never deploy.
