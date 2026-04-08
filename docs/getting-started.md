# Getting started

1. Install dependencies: `npm install`
2. Build: `npm run build`
3. Refresh generated catalog docs when you edit prompt/skill inventory: `node dist/scripts/generate-catalog-docs.js`
4. Bootstrap Codex assets and a local project: `node dist/cli/onx.js setup --project .`
5. Browse the generated catalogs:
   - Skills: `docs/skills.md`
   - Prompts: `docs/prompts.md`
   - CLI: `docs/cli.md`
   - JSON contract: `docs/catalog.json`
6. Seed story-memory if this project already has recurring characters / world rules:
   - `onx story-write --collection characters --key heroine --text "# Heroine"`
   - `onx story-write --collection voice --key default --text "# Default voice"`
   - `onx continuity-report --project .`
7. Start using the included skills from Codex:
   - `$novel-interview`
   - `$story-architect`
   - `$draft-longform`
   - `$ending-killshot`
   - `$publish-check`
