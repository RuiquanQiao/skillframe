# Changelog

All notable changes to the `skillframe` and `create-skillframe` packages. Versions follow
[semantic versioning](https://semver.org); before 1.0, a minor version may change the API.

## Unreleased

- Fixed: the sidebar showed Markdown tables as raw `| a | b |` lines. Agents use tables often, so
  they now show as tables, including one written right under a sentence with no blank line. A
  table too wide for the sidebar scrolls sideways inside the reply.
- New example: `examples/grill-me` (`npm run grill`), the terminal-only `grilling` skill given a
  screen with a question form and a design tree.

## create-skillframe 0.1.3 (2026-11-02)

- Fixed: in Windows PowerShell 5.1, `npm create skillframe my-app -- --eject` made an app without
  the copy and said nothing, because PowerShell drops the `--` and npm kept `--eject` for itself.
  create-skillframe now also reads it from npm (`npm_config_eject`), so the command works in every
  shell.

## skillframe 0.1.3, create-skillframe 0.1.2 (2026-11-02)

skillframe is now meant to be copied and changed as well as installed.

- New: `npx skillframe eject [folder]` copies the core (plain JavaScript, no build step), the
  sidebar and the MCP bridge into your app, with a README saying which file does what. The app
  then imports `./skillframe/index.js` and stops getting updates from npm.
- New: `npm create skillframe my-app -- --eject` makes the example app with skillframe already
  copied in.
- Changed: the core finds its `ui/` and `bin/` folders by looking upward from its own folder,
  instead of at a fixed depth, so it runs from the npm package and from a copy alike.
- README (English and Chinese): a "Make it yours" section; the note on keeping `workspace` out of
  your repository is now a tip with its reason, not a rule.
- create-skillframe now depends on skillframe (for `--eject`).

## skillframe 0.1.2, create-skillframe 0.1.1 (2026-11-02)

No code changes. This release only makes the packages easier to find.

- npm keywords: both packages now list the words people search for, besides the technology names:
  `no-api-key`, `subscription`, `bring-your-own-agent`, `ai-sidebar`, `agent-ui`, `chat-ui`,
  `claude`, `qwen-code`, `tauri`, `agent-client-protocol`, `model-context-protocol` and others.
  `create-skillframe` also gets `starter`, `template` and `create-app`.
- README (English and Chinese): a "How it compares" section on how skillframe differs from the
  Claude Agent SDK, the Vercel AI SDK, Claude Code Router and cligent, and the first paragraph
  now says "no API key" and names Electron, Tauri and web apps.

## skillframe 0.1.1 (2026-11-02)

- Fixed: picking another agent right after a reply finished could switch the sidebar back to the
  chat the user had just left. The reload that runs when a reply ends now gives way to the user's
  switch.
- README: a FAQ entry on why skillframe runs on the user's own computer and can't be deployed as
  a hosted website.

## skillframe 0.1.0, create-skillframe 0.1.0 (2026-11-02)

First release.

- The `<skillframe-chat>` sidebar and `createSkillframe()` server: Claude Code, Codex and ACP
  agents (Qwen Code tested for connection only), the app's tools served to every agent over one
  local MCP server, screen context, shared files, permission, question and plan cards, forks,
  attachments, English and Chinese.
- `npm create skillframe`: a todo app with the sidebar, ready to run.
