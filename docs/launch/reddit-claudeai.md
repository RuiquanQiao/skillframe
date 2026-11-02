# r/ClaudeAI 草稿

发之前：看一眼 r/ClaudeAI 当前的版规和置顶帖，确认自我推广的项目要不要用特定 flair（通常是
"Built with Claude" 一类）、是否限定星期几发。

标题：

```
I built an open-source sidebar that runs your users' own Claude Code inside any app (no API key)
```

正文：

```
I wanted an AI sidebar in my own app, but I didn't want users to paste an API key, and I didn't
want to pay for their tokens. So I built skillframe (MIT): a Web Component plus a Node function
that starts the Claude Code the user already installed and signed in to, and puts it in a
sidebar next to your app.

[demo video]

What the agent can do with your app:
- call your app's functions as tools (one local MCP server, pre-approved),
- edit files your page watches; if both sides write at once, the late write gets a conflict
  instead of overwriting,
- know what the user is looking at (you send it with every message).

The sidebar shows replies, thinking and tool steps, permission/question/plan cards, the task
list, model and permission-mode pickers. Codex works too, and ACP agents (Qwen Code tested for
connection only so far).

It runs locally only: the agent runs on the machine that runs your app's server, so it's for
Electron and local web apps, not hosted websites.

About subscriptions: skillframe never touches the sign-in; it runs the unmodified `claude`
command. The README FAQ quotes Anthropic's legal page on this and links it; please read it
yourself if you ship something commercial.

npm create skillframe my-app
GitHub: https://github.com/RuiquanQiao/skillframe

Feedback welcome, especially on what your app would want the agent to do.
```

把 `[demo video]` 换成上传的 `docs/media/skillframe-demo.mp4`（Reddit 支持直接上传视频）。
