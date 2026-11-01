<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/RuiquanQiao/skillframe/main/docs/media/banner-dark.png">
    <img alt="skillframe：把用户自己的 coding agent 放进你的 app" src="https://raw.githubusercontent.com/RuiquanQiao/skillframe/main/docs/media/banner-light.png" width="600">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/RuiquanQiao/skillframe/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/RuiquanQiao/skillframe/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT 协议" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="Node 22 及以上" src="https://img.shields.io/badge/node-%E2%89%A522-339933">
  <img alt="零运行时依赖" src="https://img.shields.io/badge/runtime%20dependencies-0-brightgreen">
  <img alt="Windows、macOS、Linux" src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey">
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#接进你的-app">接进你的 app</a> ·
  <a href="#原理">原理</a> ·
  <a href="docs/PROTOCOL.md">协议</a> ·
  <a href="#常见问题">常见问题</a> ·
  <a href="README.md">English</a>
</p>

skillframe 给你的 app 加一个侧边栏，里面跑的是**用户自己的 coding agent**：Claude Code、Codex，
或者任何支持 [Agent Client Protocol](https://agentclientprotocol.com)（ACP）的 agent，比如 Qwen Code。
用的是**用户自己的**订阅额度，而且和你的界面双向联动。

<p align="center">
  <img alt="演示：skillframe 只占左边的侧边栏；侧边栏里的 agent 往右边的示例 app 里加待办，接着换 Codex 再加一条" src="https://raw.githubusercontent.com/RuiquanQiao/skillframe/main/docs/media/skillframe-demo.gif" width="800">
  <br>
  <sub>用真实的 Claude Code 和 Codex 录制，等待 agent 回复的片段加速播放。<a href="https://github.com/RuiquanQiao/skillframe/raw/main/docs/media/skillframe-demo.mp4">原画质 MP4</a></sub>
</p>

## 为什么用 skillframe

- **不用 API key，不用你付钱。** 用户不用粘贴 key，你也不用替用户的 token 买单：侧边栏跑的是用户
  已经装好、已经登录的 agent。
- **双向联动。** agent 能把你 app 里的函数当工具调用，能改你页面正在监听的文件，还知道用户此刻在看
  什么。你的按钮也能直接在侧边栏里发起任务。
- **不绑定一家。** Claude Code、Codex 和 ACP agent 共用一个侧边栏，用户自己选，你的产品不用押宝在
  一家厂商身上。
- **拿来就能用。** 一个 Web Component 加一个 Node 函数。零运行时依赖，任何前端框架都行，不用框架也
  行，Electron、Tauri 里也能跑。
- **窗口其余部分都是你的。** skillframe 只占侧边栏。旁边放什么（编辑器、画布、仪表盘、游戏）由你决定。

为什么不做成 Claude Code 里的插件？因为 Claude Code 和 Codex 没法在它们自己的窗口里显示你的 app：
Claude Code 的 mod 只能画固定的几种组件（不支持 HTML），MCP Apps（聊天里嵌 HTML）在 Claude Code 里
不显示。skillframe 反过来，把 agent 放进你的 app。

## 快速开始

```bash
npm create skillframe my-app
cd my-app
npm install
npm start
```

打开它打印出的地址：右边是待办列表，左边是 agent。让它"add a todo to buy milk"（加一条待办：买牛奶）。

> [!NOTE]
> skillframe 还没发布到 npm。在第一个版本发布前，请克隆本仓库，运行 `npm install`，再用
> `npm run hello` 打开示例 app。

需要 Node 22 及以上，并且电脑上至少装好、登录了下面一个 agent：

| Agent | 安装 | 登录 | 是否用真实 agent 测过 |
|---|---|---|---|
| Claude Code | `npm install -g @anthropic-ai/claude-code` | 运行 `claude`，再输入 `/login` | 是 |
| Codex | `npm install -g @openai/codex` | `codex login` | 是 |
| Qwen Code（ACP） | `npm install -g @qwen-code/qwen-code` | 运行 `qwen`，再输入 `/auth` | 只测过连接 |

## 接进你的 app

### 服务端（Node 22+）

```js
import { appDataDir, createSkillframe } from "skillframe";

const home = appDataDir("my-app"); // %APPDATA%\my-app、~/Library/Application Support/my-app、~/.local/share/my-app

const sf = createSkillframe({
  appName: "My App",
  workspace: `${home}/workspace`, // agent 的工作文件夹
  dataDir: `${home}/app`,         // 对话、附件、历史版本
  static: "./public",             // 你的页面，挂在 / 下
  watch: ["todos.json"],          // 你和 agent 都会改的文件
  context: ({ screen }) => `The user has todo #${screen?.selected} open.`,
  tools: {
    add_todo: {
      description: "Add a todo to the user's list.",
      input: { text: "string" },
      run: ({ text }, { chatId }) => {
        const { text: raw, hash } = sf.files.read("todos.json");
        // 基于刚读到的版本写入：如果 agent 在这期间改过文件，会抛出 Conflict，不会覆盖
        sf.files.write("todos.json", addTodo(raw, text), { baseHash: hash });
        return "Added.";
      },
    },
  },
});

await sf.listen({ port: 4320 });
```

> [!IMPORTANT]
> 不要把 `workspace` 放进你 app 的源码仓库。Claude Code 按 git 仓库保存记忆，agent 如果在你的仓库里
> 干活，会和开发这个仓库的人共用一份记忆。

### 页面（任何框架，或者不用框架）

```html
<script type="module" src="/sf/ui/skillframe-chat.js"></script>
<skillframe-chat endpoint="/sf"></skillframe-chat>

<script type="module">
  const chat = document.querySelector("skillframe-chat");
  chat.setScreen({ selected: 3 });                                        // 每条消息都会带上
  chat.addEventListener("file-changed", (e) => reload(e.detail.path));    // agent 改了被监听的文件
  chat.addEventListener("sf:todos", (e) => draw(e.detail));               // 你调用的 sf.publish("todos", …)
  button.onclick = () => chat.ask({ prompt: "Tidy up my todos", shown: "Tidy up" });
</script>
```

页面也能读写共享文件：`GET /sf/files?path=todos.json` 返回 `{ text, hash }`；`POST /sf/files` 提交
`{ path, text, baseHash }`，如果 agent 刚改过，会返回 409 和最新版本，而不是覆盖 agent 的修改。

### 已经有自己的服务器，或者是桌面应用

```js
http.createServer(async (req, res) => {
  if (await sf.handler(req, res)) return;
  // …你自己的路由
}).listen(3000, "127.0.0.1");
sf.setOrigin("http://127.0.0.1:3000");
```

Electron 里，在主进程启动 skillframe，窗口加载它的地址就行：见 [examples/electron](examples/electron)。
Tauri 和普通浏览器窗口也是同样的做法。

<details>
<summary><b>服务端的全部选项和方法</b></summary>

| 选项 | |
|---|---|
| `appName` | 告诉 agent 的 app 名字，也用作工具所在 MCP 服务器的名字 |
| `workspace` | agent 的工作文件夹（里面的 CLAUDE.md、AGENTS.md、skills 和设置照常加载） |
| `dataDir` | 对话、附件和文件历史版本存在这里 |
| `agents` | 提供哪些 agent，第一个是默认（默认是 skillframe 支持的全部；没装的显示为"未安装"） |
| `context({ chatId, screen })` | 用文字描述用户此刻在看什么；每条消息都会加进 agent 的指令里 |
| `tools` | 你 app 的能力：`{ description, input, optional?, run(args, { chatId }) }`。`input` 写 JSON Schema 的 properties，或者简写成 `{ name: "string" }`。通过 MCP 提供给 agent，并且预先批准。抛出的错误会作为工具失败的结果返回给 agent。 |
| `watch` | `workspace` 里共享文件的匹配规则（`"todos.json"`、`"data/**/*.md"`） |
| `static` | `listen()` 挂在 `/` 下的静态文件夹 |
| `basePath` | 侧边栏路由的前缀（默认 `/sf`） |
| `allowedTools` | 额外的 Claude Code 权限规则，匹配的操作不再询问（`"Bash(git status*)"`） |
| `allowedHosts` | 除本机地址外还接受的 Host 名 |
| `env` | 传给 agent 进程的环境变量 |

| `sf` 上的方法 | |
|---|---|
| `listen({ port, host, routes })` | 启动本地服务器；`routes(req, res)` 先处理你自己的请求（处理了就返回 `true`） |
| `handler(req, res)` | 把 skillframe 挂进你自己的服务器；处理了请求就 resolve `true` |
| `setOrigin(url)` | 配合 `handler` 用：agent 访问你工具的地址 |
| `files.read(path)` / `files.write(path, text, { baseHash })` | 带版本号（`hash`）的共享文件；`baseHash` 过期时抛出 `Conflict` |
| `publish(name, data)` | 给所有打开的页面发一个你自定义的事件（元素会触发 `sf:<name>`） |
| `send(chatId, { text, shown, screen, files })` | 从服务端发起一次回复 |
| `on((event, data) => …)` | 在进程内接收所有事件 |
| `close()` | 停掉 agent、文件监听和服务器 |

</details>

<details>
<summary><b>页面元素的全部属性、方法和事件</b></summary>

| | |
|---|---|
| 属性 | `endpoint`（默认 `/sf`）、`lang`（`en`、`zh`；默认跟随浏览器）、`theme`（`light`、`dark`；默认跟随系统） |
| `setScreen(obj)` | 用户此刻在看什么；你的 `context()` 会收到它 |
| `ask({ prompt, shown })` | 从你自己的按钮发起一次回复；结束时 resolve `{ ok, error }`。`shown` 是对话里显示的文字。 |
| `newChat()` | 新开一个对话 |
| 事件 | `chat-done`（`{ ok, error, cancelled }`）、`file-changed`（`{ path, hash, by }`）、`sf:<name>` |
| CSS 变量 | `--sf-ink`、`--sf-muted`、`--sf-line`、`--sf-soft`、`--sf-accent`、`--sf-attention`、`--sf-danger`、`--sf-bg` |

</details>

## 侧边栏能做什么

- 流式显示回复、思考过程和工具步骤；显示 agent 的任务列表。
- agent 请求权限、提问、提出计划时弹出卡片：允许、始终允许、带理由拒绝；选择答案；批准计划或让它继续完善。
- 可以选 agent、权限模式和模型；有停止按钮；agent 干活时发的消息会排队。
- 附件：粘贴、拖入或选择文件。图片直接给 agent 看，其他文件把路径给 agent。
- 可以从任意一条回复分叉出新对话（Claude Code 和 Codex）。
- 亮色和暗色，中文和英文，最窄 320 px。样式在 shadow root 里，不会和你的样式冲突；颜色都是 CSS 变量，可以自己改。

## 原理

```
┌──────────────────────────┬──────────────────────────────────────┐
│ <skillframe-chat>        │  your app (any HTML)                 │
│  the user's own agent    │                                      │
│                          │   ◀── the agent calls your tools      │
│  "add a todo: buy milk"  │   ◀── it edits a file you watch       │
│                          │   ──▶ you tell it what's on screen    │
└──────────────────────────┴──────────────────────────────────────┘
```

核心按每个 agent 自家 SDK 或编辑器插件的方式启动它：Claude Code 用 `claude -p` 加 stream-json，Codex
用 `codex app-server`，ACP agent 走 Agent Client Protocol。你的工具以一个本地 MCP 服务器的形式提供给
所有 agent，只有 skillframe 启动的进程能调用。页面和核心之间走 HTTP 和 server-sent events，协议写在
[docs/PROTOCOL.md](docs/PROTOCOL.md)，所以用别的语言写后端也能驱动同一个侧边栏。

本地服务器只响应自己的页面：只接受本机 Host 名、只接受同源的 JSON 请求，工具接口还要 token。

## 常见问题

<details>
<summary><b>这样用用户的 Claude Code 订阅，合规吗？</b></summary>

skillframe 只启动用户自己安装、自己登录的 agent 命令行，**不做任何修改**。它不自带 agent，不用
Claude Agent SDK，也从不读取、保存或转发登录凭证；登录永远在 agent 自己的流程里完成。Anthropic 的
[Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) 页面写着：开发者做产品
应该用 API key；同时也写着：这不妨碍终端用户用自己的订阅登录未经修改的 Claude Code。这个页面 2026 年
改过好几次，如果你要做商业产品，请自己读一遍。从第一天起就支持多家 agent，正是 skillframe 应对这个
风险的办法。

</details>

<details>
<summary><b>token 谁付钱？</b></summary>

用户，通过他们已经在 Claude、ChatGPT 或其他服务商那里买的套餐。你的 app 从头到尾见不到 key，自己也
不调用任何模型。

</details>

<details>
<summary><b>用户电脑上没装 agent 怎么办？</b></summary>

侧边栏会说明哪个 agent 没装或没登录，并给出安装命令和登录方法。没装的 agent 在选择器里显示为"未安装"。

</details>

<details>
<summary><b>agent 会不会动到我 app 以外的文件？</b></summary>

它在你指定的 `workspace` 文件夹里干活，权限模式由用户选："编辑前先问"模式下，每次改文件或运行命令
前都会先问，侧边栏把每个请求显示成一张卡片。你自己的工具是预先批准的，其他操作照 agent 自己的权限
规则来。

</details>

<details>
<summary><b>我的后端不是 Node，能用吗？</b></summary>

侧边栏只用 HTTP 和 server-sent events 通信，协议写在 [docs/PROTOCOL.md](docs/PROTOCOL.md)。目前和
agent 打交道的核心是这个 Node 包；别的语言的后端可以把它当作一个小的附属进程跑，也可以自己实现这套
协议。

</details>

## 文档

| 想做什么 | 从这里开始 |
|---|---|
| 跑起示例 | [快速开始](#快速开始) |
| 给已有的 app 加侧边栏 | [接进你的 app](#接进你的-app) |
| 放进桌面应用 | [examples/electron](examples/electron) |
| 用别的语言驱动侧边栏 | [docs/PROTOCOL.md](docs/PROTOCOL.md)（英文） |
| 了解背后的设计决定 | [docs/DESIGN.md](docs/DESIGN.md) |
| 重新录制演示视频 | [docs/DEMO.md](docs/DEMO.md) |

## 参与开发

```bash
npm install
npm test
```

所有测试都跑在假的 Claude Code、假的 Codex 和假的 ACP agent 上，它们和真的说同样的协议，所以测试
不花 token。侧边栏的界面测试用电脑上已有的 Chrome 或 Edge 无头运行；两个都没有就跳过，并说明原因。
CI 在 Windows、macOS、Linux 三个系统、Node 22 和 24 上都跑一遍。

- `packages/skillframe`：库本身（零运行时依赖）
- `packages/create-skillframe`：`npm create skillframe`
- `examples/hello`：用 TypeScript 写的笔记示例（`npm run hello`）
- `examples/electron`：同一个侧边栏放进 Electron 窗口（`cd examples/electron && npm install && npm start`）

## 路线图

- [x] Claude Code、Codex、ACP 三种 driver；工具走 MCP；共享文件带冲突检测
- [x] 权限、提问、计划卡片；模式和模型选择器；附件；分叉
- [x] `npm create skillframe`、Electron 示例、三系统 CI
- [ ] 第一个版本发布到 npm
- [ ] 用真实的 ACP agent（Qwen Code）验证完整对话
- [ ] 支持更多 agent，比如 Pi

欢迎提 issue 和 pull request。

## 协议

[MIT](LICENSE)
