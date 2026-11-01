# 60 秒演示视频：拍摄脚本

给 M4/M5 发布用。视频要回答开发者心里的一个问题："这东西能让**我的** app 用上**用户自己的** Claude Code 吗？要多少代码？"

- 时长：60 秒左右，不配音也能看懂（字幕用英文，发 HN、X、Reddit 用；发 V2EX 时可以换中文字幕）。
- 画面：1920×1080，浏览器缩放 125%，系统用浅色主题（暗色在社交平台的缩略图里看不清）。
- 准备：Claude Code 已登录；`npm create skillframe` 生成的 todo 示例已经 `npm install` 过；终端字号调大；关掉通知。
- 每一镜开拍前先清空对话（侧边栏点"New chat"），避免出现上一次的内容。

## 分镜

| 时间 | 画面 | 屏幕字幕（英文） | 操作要点 |
|---|---|---|---|
| 0–5 秒 | 黑底白字 | Your app. Your users' own Claude Code. No API key. | 只放字，不放画面 |
| 5–15 秒 | 终端：`npm create skillframe my-app`，接着 `cd my-app && npm install`、`npm start` | Create, install, start. | 每条命令的输出出来再打下一条 |
| 15–20 秒 | 浏览器打开 app：左边侧边栏，右边先完全空着，只有一个虚线框写着 "Your app goes here" | skillframe is only the sidebar. The rest of the window is yours. | 先让观众看清：skillframe 只占侧边栏，右边是开发者的地方，免得误以为右边的东西是产品的一部分 |
| 20–30 秒 | 虚线框淡出，露出示例 todo 列表。在侧边栏输入 "add todos for a trip to Tokyo: passport, yen, JR pass"，回车 | For example, a todo app. The sidebar runs the user's own agent, on their own plan. | 等 agent 调 `add_todo`，右边三条 todo 依次出现。这是全片最重要的一镜：**左边说话，右边变化** |
| 30–40 秒 | 用户在右边勾掉 "passport"；接着在侧边栏输入 "what's left?" | It sees what you see. | agent 回答剩下两条，说明它读到了 app 的状态 |
| 40–50 秒 | 浅色背景上一个编辑器窗口，标题写明是开发者自己的 `server.js`（缩写版），显示 `context` 和 `tools` 这十几行 | Your app's abilities become the agent's tools. | 做成一个窗口而不是全屏，免得被当成产品界面 |
| 50–55 秒 | 侧边栏顶部的 agent 选择器切到 Codex，再发一句 "add: buy an umbrella" | Claude Code, Codex, or any ACP agent. | 右边多出一条 |
| 55–60 秒 | 黑底：项目名 + 安装命令 + 仓库地址 | `npm create skillframe` · MIT | 仓库地址等发布时再填 |

## 自动录制

不用手动拍：`scripts/record-demo.mjs` 用本机真实的 Claude Code 和 Codex 把上面的分镜跑一遍，录成 `skillframe-demo.mp4`（1920×1080，约 58 秒）。等 agent 回复的片段会自动加速，画面右上角标出"Sped up N×"。成片在 `docs/media/skillframe-demo.mp4`。

```bash
node packages/create-skillframe/index.js <空文件夹>/my-app --skillframe file:<本仓库>/packages/skillframe
cd <空文件夹>/my-app && npm install
node <本仓库>/scripts/record-demo.mjs <空文件夹>/my-app <输出文件夹>
```

- 要先 `npm run build`（或 `npm test`），脚本用到 `packages/skillframe/dist`。
- 需要 Chrome、ffmpeg，以及 Playwright 自己的 ffmpeg（`npx playwright-core install ffmpeg`）。
- 录一次大约花掉 Claude Code 和 Codex 各两三条消息的额度。
- 录制时 Claude Code 只加载 app 自己的 MCP 服务器（`--strict-mcp-config`），录制机器上的其他 MCP 服务器和它们的登录提示不会进画面。
- 终端那一镜和代码那一镜是脚本画出来的页面：终端里的输出是 create-skillframe 和 app 的真实输出（去掉了路径），代码是 `server.js` 的缩写版，画面上标了"shortened"。

## 拍之前自查

- 画面里不能出现你的邮箱、账号名、API key、终端里的私人路径。登录状态只显示"已登录"，不要打开账号页面。
- 产品名和画面里不能出现 Claude 或 Anthropic 的 logo；字幕里如实写 "runs Claude Code" 是允许的（见 `docs/DESIGN.md` 第 5.2 节）。
- 每一镜都先完整排练一次，确认 agent 的回答稳定，再正式录。
