# Changelog

All notable changes to the `skillframe` and `create-skillframe` packages. Versions follow
[semantic versioning](https://semver.org); before 1.0, a minor version may change the API.

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
