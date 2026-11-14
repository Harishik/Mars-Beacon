# Contributing to Mars-Beacon

## One-time setup after cloning

```bash
git config core.hooksPath .githooks
```

This turns on a commit hook that removes AI-assistant `Co-Authored-By` lines from commit messages.

## Commit rules

- Do not credit AI tools (Claude, ChatGPT, Copilot, etc.) as commit co-authors. A CI check rejects commits that do.
- Disclose AI tool use in the project's "Use of SI" section instead, as the NASA Space Apps rules require.
- `.claude/settings.json` turns off Claude Code's automatic commit and PR attribution for everyone working in this repo.
