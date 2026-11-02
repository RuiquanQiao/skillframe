# Show HN 草稿

标题（HN 限 80 个字符，这条 74 个）：

```
Show HN: Skillframe – put your users' own Claude Code or Codex in your app
```

链接填 GitHub 仓库：https://github.com/RuiquanQiao/skillframe

正文（HN 的 Show HN 带链接时正文可留空；建议发完帖子后立刻把下面这段作为第一条评论）：

```
Hi HN, I built skillframe because I wanted an AI sidebar in my own desktop app without
asking users for an API key or paying for their tokens.

skillframe is a Web Component plus a Node function. The sidebar starts the coding agent the
user already installed and signed in to (Claude Code, Codex, or an Agent Client Protocol agent
such as Qwen Code) and runs it on the user's own subscription. It is wired both ways into your
app:

- your app's functions become tools the agent can call (served to every agent over one local
  MCP server),
- the agent can edit files your page watches, with conflict detection when both sides write,
- your page tells the agent what the user is looking at, and your buttons can start a task.

The sidebar has permission, question and plan cards, agent and model pickers, attachments and
forks. No runtime dependencies; works in Electron or a local web app.

What it isn't: it is not a hosted service. The agent runs on the computer that runs your app's
server, so it is for desktop apps and local web apps, not websites.

On terms: skillframe only starts the unmodified agent CLI the user installed, never touches
their sign-in, and doesn't use the Claude Agent SDK. Anthropic's legal page says this doesn't
prevent an end user from signing in to the unmodified Claude Code binary with their own
subscription, but that page has changed several times this year, which is one reason it
supports several agents.

Quick start: npm create skillframe my-app

Status: first release this week. Claude Code and Codex are tested end to end with the real
agents; Qwen Code is tested for connection only. I'd love feedback on the API and on which
agents to add next.
```

## 发帖后

- 前两个小时守着回评论，最常见的问题大概是"Anthropic 允许吗"和"为什么不直接用 Agent SDK"。
  两个答案都在 README（常见问题、How it compares）里，回复时贴对应的锚点链接。
- HN 不允许拉票，别在别处发"去 HN 给我点赞"。
