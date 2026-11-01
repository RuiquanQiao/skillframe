# skillframe 设计方案（v0 草案）

2026-11-01 · 乔睿泉（Ruiquan Qiao）· 状态：待评审，尚未写代码

---

## 1. 一句话定位

**skillframe 是一个 TypeScript 开源库：任何开发者把它装进自己的 app，app 里就多出一个 agent 栏，跑的是最终用户自己电脑上、用户自己登录的 Claude Code / Codex 等 coding agent，花的是用户自己的订阅额度；并且 agent 和 app 的界面能双向联动。**

- **谁用**：做本地工具、桌面 app、本地 Web app 的开发者，他们想让 app 带一个 AI 助手，但不想自己掏 API 钱、也不想让用户再填一个 API key。
- **成功的样子**：开发者心里有一句话——"想让用户用自己的 Claude Code 额度，就用 skillframe"。
- **唯一硬指标**：有多少个**别人**做的 app 用上了它（star 数只代表关注度）。

### 本文用到的几个词

| 词 | 意思 |
|---|---|
| **宿主 app** | 装了 skillframe 的那个 app，比如以后的某个论文工具。它是主角，skillframe 只是它的一个依赖。 |
| **agent 栏** | skillframe 提供的聊天侧边栏：选 agent、流式回复、工具步骤、权限确认卡片、提问卡片、中断、附件等。resume-studio 左边那一栏就是它的原型。 |
| **coding agent / agent CLI** | 用户自己装的命令行 agent：`claude`（Claude Code）、`codex`（Codex CLI）、`qwen`、`pi` 等。各自管自己的登录。 |
| **driver** | skillframe 里"怎么跟某一种 agent CLI 对话"的那一层代码。每种协议一个 driver。 |
| **联动** | app 界面和 agent 之间互相影响，具体见第 4 节的三条通道。 |
| **SSE** | Server-Sent Events，浏览器标准里"服务器持续往页面推消息"的机制。agent 的回复一个字一个字地流到页面上，靠的就是它。 |
| **fork** | 从聊天里某条消息分叉出一个新会话，原会话不受影响。 |

---

## 2. 为什么现在需要它

- Claude Code 的 **mods**（2026-10-01 随 v2.1.287 发布）能在 Claude Code 里画侧边面板，但只能用固定组件（Box、Text、Button……），**不能放任意 HTML**，所以放不进一个完整的 app。
- **MCP Apps**（2026-01）能让任意 HTML 进入 Claude 和 ChatGPT 的聊天，但官方文档写明 **Claude Code 不渲染它**。
- 社区里有不少"给 Claude Code 套一层图形界面"的项目（opcode、CloudCLI 等），它们的产品是"更好用的 Claude Code"，**不是给别的 app 当底座的库**。2026-11-01 再次搜索，仍没找到"可嵌入的 agent 栏 + 用户自己的订阅"这种开源库。

细节和出处见 [skill-ui-research.html](skill-ui-research.html)。

---

## 3. 开发者看到的样子（目标：5 分钟跑起来）

下面是**接口草案**，名字和参数在评审后可以改。

### 3.1 后端（Node）

```ts
import { createSkillframe } from "skillframe";

const sf = createSkillframe({
  appName: "Paper Lab",            // 出现在 agent 握手信息和报错里，不再写死成某个产品名
  workspace: "./my-project",       // agent 的工作目录
  dataDir: "./.paperlab",          // 聊天记录、偏好设置存在这里（由宿主 app 决定位置）
  agents: ["claude", "codex", "qwen"],

  // 联动通道 ①：每次发消息前，问宿主 app"用户现在在看什么"，结果作为系统提示附给 agent
  context: async ({ screen }) => `用户正在看论文 ${screen.paperId} 的第 ${screen.section} 节。`,

  // 联动通道 ②：宿主 app 暴露给 agent 的工具（通过 MCP 交给 agent，见 4.2）
  tools: {
    highlight: {
      description: "在用户的界面上高亮一段论文原文",
      input: { paperId: "string", quote: "string" },
      run: async ({ paperId, quote }) => ui.highlight(paperId, quote),
    },
  },

  // 联动通道 ③：agent 改了这些文件，界面自动收到通知
  watch: ["data/**/*.yaml"],
});

await sf.listen();                 // 自己起一个本地 HTTP 服务；或者：
// app.use("/sf", sf.handler);     // 挂进宿主 app 已有的 HTTP 服务（Express / Hono / Node http）
```

### 3.2 前端（任意框架，或者不用框架）

```html
<script type="module" src="/sf/ui.js"></script>
<skillframe-chat endpoint="/sf" lang="zh"></skillframe-chat>

<script type="module">
  const chat = document.querySelector("skillframe-chat");
  chat.setScreen({ paperId: "p-12", section: 3 });       // 告诉 agent 用户在看什么
  myButton.onclick = () => chat.ask({                     // app 自己的按钮发起一轮对话
    prompt: "把第 3 节第 2 段改得更简洁，直接改 data/p-12.yaml",
    shown: "润色这一段",                                   // 聊天里显示给用户看的短版本
  });
  chat.addEventListener("file-changed", (e) => reload(e.detail.path));
</script>
```

- `<skillframe-chat>` 是一个 **Web Component**（浏览器原生的自定义标签）。React、Vue、Svelte 或纯 HTML 都能直接用，不逼开发者换框架。React 包装可以后面再加。
- 栏放在左边还是右边、多宽、能不能折叠，由宿主 app 决定；skillframe 不接管整个页面布局。
- 这个前端组件也能放进 Electron、Tauri 或普通浏览器窗口，不绑定任何一种桌面壳。

### 3.3 脚手架

```bash
npm create skillframe@latest my-app
```

生成一个最小示例：左边 agent 栏，右边是一个 todo 列表，背后是一个 `todos.yaml` 文件。让 agent "加三条待办"，右边立刻刷新。**这个示例能在 5 分钟内跑出来，是第一版的交付标准。**

---

## 4. 联动：三条通道

这是 skillframe 和"又一个 Claude Code 图形界面"的根本区别，接口围绕这三条来设计。

从上到下四层：

```
[第 1 层] 宿主 app 的窗口（浏览器、Electron 或 Tauri）
          ├─ <skillframe-chat>  agent 栏
          └─ 宿主 app 自己的界面（任意 HTML）
                │
                │  agent 栏 ⇄ 核心：HTTP + SSE（skillframe 协议，公开文档）
                │  app 界面 ⇄ app 后端：宿主 app 自己的接口
                ▼
[第 2 层] 一个 Node 进程：skillframe 核心 + 宿主 app 的后端
          ├─ 聊天：存储、排队、中断、fork
          ├─ 三条通道：context()、tools（MCP）、watch（文件监听）
          └─ drivers：claude / codex / acp / pi
                │
                │  stdin / stdout（每种 agent 官方提供的程序接口）
                ▼
[第 3 层] 用户自己装的 agent CLI：claude、codex、qwen……
          用户在 agent 自己的流程里登录，skillframe 不碰凭证
                │
                ▼
[第 4 层] 用户自己的订阅（Claude Pro/Max、ChatGPT Plus……），额度记在用户账上
```

### 4.1 通道 ①：界面 → agent（"用户在看什么"和"按钮发起的任务"）

- `chat.setScreen(...)` 加上后端的 `context()`，在每一轮对话开始时变成一段附加的系统提示。resume-studio 里对 Claude Code 用的是 `--append-system-prompt-file`，对其他 agent 各有对应做法，已经在 `core/drivers.py` 里跑通了。
- `chat.ask({ prompt, shown, addDirs, onDone })`：宿主 app 自己的按钮（比如"润色"）拼好提示词发出去。`shown` 是聊天里显示给用户看的短版本，`addDirs` 让 agent 能多读几个目录，`onDone(ok)` 在这一轮成功结束后回调宿主 app。这套参数直接来自 resume-studio 的 `/api/chats/{cid}/send`。

### 4.2 通道 ②：agent → 界面（agent 调用宿主 app 的能力）

- resume-studio 目前的做法是写命令行脚本（`scripts/hunt.py`、`scripts/plan.py`），再在 SKILL.md 里教 agent 用 Bash 调用。这种做法能用，但每个 app 都要自己写一遍。
- skillframe 改用 **MCP**（Model Context Protocol，Claude Code、Codex、Qwen Code 都支持的开放工具协议）：宿主 app 在 `tools` 里声明的每个工具，由 skillframe 包成一个本地 MCP server，启动 agent 时自动挂上（Claude Code 用 `--mcp-config`，Codex 用它的 `mcp_servers` 配置，ACP 在 `session/new` 里传 `mcpServers`），并且把这些工具预先加进允许列表，不用每次弹权限确认。
- 用户自己配的其他 MCP server 照常保留，skillframe 只是额外加一个。
- **待验证（里程碑 1）**：三种 agent 能不能统一挂 HTTP 形式的 MCP server。不能的话，就退回到"一个 stdio 小程序转发到本地 HTTP"的做法。
  - 2026-11-01 已验证 Claude Code 2.1.288：用 `--mcp-config` 挂 HTTP 形式的 MCP server 可行，真实的 Claude Code 调用了示例 app 的 `add_note` 和 `list_notes`。
  - 2026-11-01 已验证 Codex 0.165.0：启动 `codex app-server` 时用 `-c mcp_servers.<名字>.url=...` 挂同一个 HTTP MCP server，令牌通过环境变量 `SKILLFRAME_MCP_TOKEN` 传入（`bearer_token_env_var`），不出现在命令行里，用户的 `~/.codex/config.toml` 不受影响。真实的 Codex 调用了 `add_note`。Codex 调用 MCP 工具前会发一个 `mcpServer/elicitation/request` 请求批准；宿主 app 自己的工具由 skillframe 自动批准，和 Claude Code 的 `--allowedTools` 效果一致。ACP 留到 M3 验证。

### 4.3 通道 ③：agent 改文件 → 界面刷新

- 宿主 app 在 `watch` 里列出关心的文件。agent 改了它们，前端收到 `file-changed` 事件。
- 宿主 app 和 agent 同时改同一处时，报冲突而不是互相覆盖；每次保存都在 `dataDir/history` 留一份副本。这两点 resume-studio 的 `core/store.py`、`core/watcher.py` 都已经做过，搬过来时改成和具体文件格式无关的版本（YAML 读写作为可选插件）。

---

## 5. 接 agent：drivers 和合规边界

### 5.1 第一版支持的 agent

| agent | 协议 | 来源 |
|---|---|---|
| Claude Code | `claude -p --input-format stream-json --output-format stream-json`，权限请求走 `--permission-prompt-tool stdio` | resume-studio `ClaudeDriver`，用 TS 重写 |
| Codex | `codex app-server`（Codex 自家 IDE 插件用的 JSON-RPC 接口） | resume-studio `CodexDriver`，用 TS 重写 |
| Qwen Code、DeepSeek Harness 等 | ACP（Agent Client Protocol，Zed 和 JetBrains 推的开放标准） | resume-studio `AcpDriver`，用 TS 重写。原计划用官方 SDK `@agentclientprotocol/sdk`，M3 实际改成自己实现：ACP 本身就是 stdio 上的 JSON-RPC，和 Codex driver 共用同一个 `Rpc` 类，几百行就够，核心包因此保持零运行时依赖 |
| Pi | `pi --mode rpc` | resume-studio `PiDriver`，用 TS 重写（优先级最低） |

### 5.2 合规边界（写进 README 第一屏，这是开发者敢用的理由）

依据 Anthropic 官方 [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) 页面（2026-11-01 核对）：

- 页面明确写着：开发者用 **Agent SDK** 做产品时**应使用 API key**；不允许第三方 app 提供 Claude.ai 登录，也不允许第三方 app 替用户转发订阅凭证。
- 同一页面也写明：这些限制**不妨碍最终用户用自己的订阅登录一个未经修改的 Claude Code 程序**。

所以 skillframe 定下四条规矩：

1. **只启动用户自己装的、未经修改的 `claude` / `codex` 程序。** skillframe 自己不打包 agent 程序。
2. **不用 Claude Agent SDK，也不用基于它的 ACP 适配器。** 两个原因：一是官方 TypeScript Agent SDK 会把它自己的一份 Claude Code 程序作为依赖装进来，那就不是"用户自己装的那份"了；二是官方文档对 SDK 产品要求用 API key。社区的 `claude-code-acp` 适配器就是基于 Agent SDK 的，所以 Claude Code 由 skillframe 自己的 driver 直接接，ACP 只用来接那些原生支持 ACP 的 agent。
3. **从不读取、保存、转发任何登录凭证。** 登录一律让用户在 agent 自己的流程里完成（比如运行 `claude` 后按提示登录）。skillframe 只检查"看起来登录了没有"，没登录就提示用户去哪里登录。resume-studio 的 `core/agents.py` 就是这么做的。
4. **产品名和 logo 里不出现 Claude、Anthropic。** 文字里可以如实写"支持 Claude Code"。

**要如实告诉开发者的风险**：2026 年 Anthropic 关于订阅能不能被第三方工具使用的政策至少改过三次（见调研报告的时间线）。skillframe 从第一天起就把 Codex 和其他 agent 放在跟 Claude Code 同等的位置，不押在一家身上。做商业产品的开发者，README 里会建议他们自己读一遍上面那个页面。

---

## 6. 代码怎么组织

一个仓库，分几个 npm 包（monorepo）：

| 包 | 内容 |
|---|---|
| `skillframe` | Node 核心：drivers、chat 存储和排队、HTTP + SSE 接口、context / tools / watch 三条通道、agent 安装与登录检测 |
| `@skillframe/ui` | `<skillframe-chat>` Web Component，不依赖任何前端框架；随核心一起由 `/sf/ui.js` 提供，不用另外构建 |
| `create-skillframe` | `npm create skillframe` 脚手架 |
| `examples/todo` | 最小示例（第 3.3 节） |
| `examples/electron` | 放进 Electron 窗口的示例，证明不绑定桌面壳 |
| `docs/PROTOCOL.md` | 前端和核心之间的 HTTP + SSE 协议说明。写成公开文档，以后别人可以照着写 Python、Rust 版的后端 |

- 语言：TypeScript，运行在 Node 22 以上。
- 开源协议：建议 **MIT**（OpenClaw、career-ops 都是 MIT，开发者最没顾虑）。
- 依赖尽量少：截至 M3，核心包**零运行时依赖**。HTTP、事件流、MCP server（只实现无状态的最小子集）、Codex 和 ACP 的 JSON-RPC 都用 Node 自带的能力写成。开发依赖只有 TypeScript、`@types/node` 和 `playwright-core`（界面测试用，只是驱动库，不下载浏览器，直接用本机的 Chrome 或 Edge）。

---

## 7. 从 resume-studio 借什么（只读，不改 resume-studio）

resume-studio 保持原样，只当参考。下表是"读哪里、在 skillframe 里变成什么"：

| resume-studio 里 | 在 skillframe 里 |
|---|---|
| `core/drivers.py`（约 1200 行，5 种 agent） | 用 TS 重写成 `drivers/`；协议细节和踩过的坑照搬 |
| `core/agents.py`（找命令、判断登录、提示安装） | `agents/`；`STUDIO_<ID>_CMD` 测试替身的做法保留，改名 `SKILLFRAME_<ID>_CMD` |
| `core/chat.py`（ChatStore、Turn、ChatRunner） | `chat/` |
| `resume/api.py` 里 15 个聊天相关路由（`/api/chats*` 13 个，加 `/api/claude`、`/api/chat-defaults`） | 核心自带的 HTTP 接口，宿主 app 一行都不用写 |
| `web/chat.js`（约 100KB）+ `chat.css` | `@skillframe/ui`；去掉对 `app.js` 全局变量和加载顺序的依赖 |
| `resume/prompts.py` 的 `ui_context` | 变成 `context()` 钩子，内容由宿主 app 提供 |
| 写死的 "Resume Studio"、`RESUME_STUDIO_CHAT`、`resume-studio-data` | 全部改成来自 `appName`、`dataDir` 配置 |
| `core/store.py`、`core/watcher.py`、`core/events.py` | `watch` 通道和 SSE 事件 |
| `core/browser.py`、`core/cdp.py`（内嵌浏览器） | **第一版不做**，以后作为可选插件 |

---

## 8. 第一版做什么、不做什么

**做：**
- Claude Code 和 Codex 两个 driver，ACP 一个 driver（顺带支持 Qwen Code 等）
- agent 栏：流式回复、工具步骤、权限卡片、提问卡片、计划审批、中断、排队、附件、多会话列表、选模型和权限模式
- 三条联动通道
- 中英文界面
- 脚手架、todo 示例、Electron 示例、README、PROTOCOL.md

**不做（以后再说）：**
- 内嵌浏览器、Pi driver
- "一个程序里装多个 app"的平台形态
- 云端、多用户、远程访问

---

## 9. 测试（不花 token）

- 每个 driver 配一个**假 agent**：一个小脚本，按录好的真实协议记录回放（文字、工具调用、权限请求、出错、中途断开）。测试通过 `SKILLFRAME_<ID>_CMD` 换成假 agent，一条命令跑完全套，只输出一行汇总和失败名单。
- 协议记录从真实 agent 录一次，存进仓库；agent 升级、协议变了，重录一次，测试立刻告诉你哪里不兼容。
- 前端组件用无头浏览器测：每种卡片、每种状态、超长内容、窄宽两种宽度、亮暗两种颜色，用脚本量有没有溢出。（M3 已做：`test/ui.test.ts`，用本机已装的 Chrome 或 Edge 以无头模式跑，11 个用例。M2 遗留的"快速点新对话再立刻切 agent"问题，M3 写成测试后发现 M2 的修法并不完整：已经开始的对话上点"新对话"时，新对话要等服务器建好，这段时间里切 agent 仍然会按旧对话处理。M3 改成"切换当前对话的操作按顺序一个一个执行"，这个测试在 M2 提交的界面代码上失败、在新代码上通过。）
- 真 agent 的端到端测试单独一条命令，手动跑，因为它会花额度。

---

## 10. 里程碑

| 阶段 | 内容 | 判断标准 |
|---|---|---|
| M1 打通（2026-11-01 完成） | Claude Code driver（TS）+ 最简 HTTP/SSE + 一个能聊天的页面；验证 MCP 挂载（4.2 的待验证项） | 在示例页面里跟自己的 Claude Code 对话，agent 能调用一个宿主 app 声明的工具 |
| M2 联动（2026-11-01 完成） | 三条通道、示例、Codex driver | agent 改共享文件，右边立刻刷新；Codex 跑同样的流程。实际做法：示例沿用 Hello Notes，笔记存进 `workspace/notes.json`（JSON 而不是 YAML，核心不必多一个 YAML 依赖）。真实的 Claude Code 直接改文件、真实的 Codex 先用 app 工具再直接改文件，右边都自动刷新 |
| M3 好用（2026-11-01 完成） | agent 栏补齐卡片和交互、ACP driver、中英文、假 agent 测试全套 | 功能达到 resume-studio 左边栏的水平。实际做了：权限模式和模型选择器（Claude Code 回复中途也能切换）、任务列表、附件（图片直接给 agent 看，其他文件给路径让 agent 自己读）、从任意一条回复分叉、展开的步骤在重绘后保持展开、ACP driver（真实的 Qwen Code 握手成功，但本机 Qwen 没登录，完整对话未验证）、浏览器界面测试。没做：Pi driver（优先级最低，留到以后）；选择器里的模式名、登录提示目前只有英文 |
| M4 发布 | 脚手架、Electron 示例、README、PROTOCOL.md、60 秒演示视频 | 一个没见过它的开发者照 README 5 分钟跑起来 |
| M5 验证 | 发 Hacker News、X、Reddit、V2EX；你自己的下一个项目基于它来做 | 发布后 4 周内有没有别人用它做的 app |

---

## 10.1 给开发者的提醒（M3 实测发现）

- **agent 的工作目录放在哪，会影响 agent 的记忆。** Claude Code 按 git 仓库划分自己的长期记忆。示例 app 的工作目录在 skillframe 仓库里面，所以示例里的 Claude Code 和在 skillframe 仓库里干活的 Claude Code 共用同一份记忆：M3 实测时让它"记住一个词"，它把这个词写进了 skillframe 项目的记忆里（已删掉）。开发者应该把 `workspace` 放在给用户数据准备的目录里，不要放在自己 app 的源码仓库里面。
- **"看起来登录了没有"只是猜测。** skillframe 只看各 agent 自己存登录信息的文件在不在（不读内容）。实测 Qwen Code 的设置文件存在，但其实没登录；这时 agent 自己报的错会显示在对话里，下面附上这个 agent 的登录方法。

## 11. 需要你决定的问题

1. **名字。** "skillframe" 是按"给 skill 加 UI"起的，现在的定位变成了"给任何 app 加一个用户自带订阅的 agent 栏"。开发者看到名字未必能联想到这件事。要不要换名，你来定；继续用这个名字也没问题，README 第一句话写清楚就行。
2. **开源协议**：MIT（推荐），还是 Apache-2.0（多一条专利授权条款，大公司法务更喜欢）？
3. **第一版只支持 Windows，还是一开始就保证 macOS / Linux 也能跑？** 想做成热门开源项目，macOS 用户很多，建议一开始就跨平台，在 GitHub Actions 上三个系统都跑测试。代价是每次调路径、调子进程时都要多想一层。
