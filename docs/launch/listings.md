# 列表登记草稿

## awesome-claude-code（github.com/hesreallyhim/awesome-claude-code）

2026-11-02 读过它的 CONTRIBUTING.md，规矩和原先设想的"提 PR"不一样：

- **不收 PR，只收网页上的 issue 表单**（Recommend a resource）。用 PR 或 `gh` 提交会被关掉，
  还可能被暂时禁止互动。
- **必须由人本人提交**，不能让 agent 代填。
- 门槛二选一：仓库首个 commit 满 14 天且之后一直有开发；或者 100 颗星。skillframe 的首个 commit
  是 2026-11-01，所以**最早 2026-11-15** 能提，到时候还要有新的 commit。
- 一次只能推荐一个资源。

表单里用的一行介绍：

```
skillframe: a Web Component and Node function that puts your users' own Claude Code (or Codex,
or an ACP agent) in a sidebar inside your app, on their own subscription. The agent calls your
app's functions as tools over MCP and edits files your UI watches.
```

## ACP 官网的客户端列表（agentclientprotocol.com/overview/clients）

这一页的源文件是 `agentclientprotocol/agent-client-protocol` 仓库里的
`docs/get-started/clients.mdx`，其他项目是提 PR 加一行进来的。skillframe 是给别的 app 加 ACP
支持的库，放在 **Frameworks** 一节最合适，格式照那一节的其他条目：

```
- [skillframe](https://github.com/RuiquanQiao/skillframe) — embeddable sidebar (Web Component and Node library) that runs the user's own ACP agent, Claude Code or Codex inside any app, with the app's functions offered to the agent as MCP tools
```

建议等路线图里"用真实的 ACP agent（Qwen Code）把完整对话测通"那一项做完再提。现在 ACP 只测过连接，
登记进 ACP 的官方列表，被人拿去接别的 ACP agent 时出问题，第一印象会很差。
