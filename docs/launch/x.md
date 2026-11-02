# X 草稿

附件：`docs/media/skillframe-demo.mp4`（比 GIF 清楚，X 会自动循环播放）。

主帖（约 260 字符，X 上限 280）：

```
I built skillframe: drop a sidebar into your app that runs your users' own Claude Code or Codex.

No API key. No token bill for you. The agent calls your app's functions as tools and edits the
files your UI watches.

npm create skillframe my-app
github.com/RuiquanQiao/skillframe
```

可选的回复串（第二、三条）：

```
How it works: the sidebar starts the agent CLI the user already signed in to (claude -p with
stream-json, codex app-server, or any Agent Client Protocol agent). Your tools reach every
agent through one local MCP server.
```

```
It's local-only on purpose: the agent runs on the user's machine, so it fits Electron apps and
local web apps. MIT, zero runtime dependencies. Feedback welcome.
```

注意：不要 @ Anthropic 或 OpenAI 的官方账号求转发，也不要用他们的 logo 做配图。
