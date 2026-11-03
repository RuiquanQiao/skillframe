// <skillframe-chat endpoint="/sf" lang="en|zh" theme="light|dark">: the agent sidebar, as a Web Component.
//
// It lives inside someone else's app, so it borrows the host page's font and stays quiet, except
// for one thing: the agent waiting for the user (a card, the amber dot). Its styles sit in a shadow
// root, so no class name here can collide with the host's. Every menu is its own popover (no
// native <select>): keyboard first, like the Claude Code and Codex desktop apps.
//
// Page API:
//   chat.setScreen(obj, label?)         what the user is looking at; sent with every message. `label`
//                                       (optional) is shown above the box: "Claude sees: …"
//   await chat.ask({ prompt, shown })   start a turn from your own button; resolves { ok, error }
//   chat.newChat()
//   events: "chat-done" ({ ok, error }), "file-changed", and "sf:<name>" for every sf.publish(name, data)
//
// Keys: Enter sends, Shift+Enter breaks the line, Esc stops a reply, Shift+Tab switches the
// permission mode, Ctrl+Shift+M / I / E open the mode / model / effort menus, / lists commands.

const STRINGS = {
  en: {
    newChat: "New chat",
    placeholder: "Message {agent}…",
    send: "Send",
    stop: "Stop",
    empty: "Ask {agent} to do something in {app}.",
    thinking: "Thinking",
    working: "Working",
    waiting: "{agent} is waiting for you",
    wantsTo: "{agent} wants to {action}",
    allow: "Allow",
    always: "Always allow",
    deny: "Deny",
    denyHint: "Or tell it what to do instead, then press Enter",
    allowed: "Allowed",
    denied: "Denied",
    cancelled: "No longer waiting",
    answered: "Answered",
    skip: "Skip",
    other: "Other answer",
    submit: "Send answers",
    planTitle: "{agent} proposes a plan",
    approveEdits: "Approve, accept edits",
    approveAsk: "Approve, ask before edits",
    keepPlanning: "Keep planning",
    planHint: "What to change in the plan (optional)",
    approved: "Plan approved",
    revise: "Asked to keep planning",
    stopped: "Stopped",
    notInstalled: "{agent} isn't installed on this computer. Install it with `{install}`, then sign in: {login}",
    queued: "Queued, sent when the current reply ends",
    chats: "Chats",
    noChats: "No chats yet",
    rename: "Rename",
    renameChat: "Rename this chat",
    deleteChat: "Delete this chat",
    deleteSure: "Click again to delete",
    agent: "Agent",
    notInstalledShort: "Not installed",
    signedOutShort: "Not signed in",
    signedOut: "{agent} doesn't look signed in on this computer. {login}",
    keepsAgent: "This chat stays with {agent}. Starting a new chat with {other}.",
    attachFiles: "Attach files",
    remove: "Remove {name}",
    mode: "Permission mode",
    modeHint: "Shift+Tab switches",
    model: "Model",
    effort: "Effort",
    asSetUp: "As set up in {agent}",
    asSetUpShort: "As set up",
    asSetUpDesc: "Whatever {agent} uses in your terminal",
    defaultModel: "Default",
    moreModels: "More models",
    modelId: "Model id, for example {id}",
    use: "Use",
    noEffort: "{model} has no effort levels",
    effortNext: "The effort level applies from the next message",
    tasks: "Tasks: {done} of {total} done",
    fork: "Fork",
    forkHint: "Start a new chat that goes on from this reply",
    copy: "Copy",
    copied: "Copied",
    tooBig: "{name} is larger than 15 MB; attach a smaller file.",
    context: "Context",
    contextUse: "{used} of {window} tokens",
    contextNone: "Send a message to see how much of the context this chat uses.",
    contextCompacted: "Compacted. The new size shows after the next reply.",
    contextFull: "Nearly full. Compacting keeps a summary and frees room.",
    contextAuto: "When it fills up, {agent} compacts it by itself.",
    compact: "Compact now",
    details: "Details",
    usage: "Plan usage",
    usageNone: "Plan usage shows after the first reply.",
    fiveHour: "Last 5 hours",
    week: "This week",
    lastHours: "Last {n} hours",
    lastDays: "Last {n} days",
    resets: "Resets {when}",
    refresh: "Refresh",
    ringTip: "Context and plan usage",
    sees: "{agent} sees",
    commands: "Commands",
    cmdModel: "Switch the model",
    cmdEffort: "Set the effort level",
    cmdMode: "Switch the permission mode",
    cmdNew: "Start a new chat",
    cmdRename: "Rename this chat",
    tookSec: "{n}s",
    tookMin: "{m}m {s}s",
    "effort.": "Auto",
    "effortDesc.": "{agent} decides per task",
    "effort.low": "Low",
    "effort.medium": "Medium",
    "effort.high": "High",
    "effort.xhigh": "Extra high",
    "effort.max": "Max",
    "effort.ultra": "Ultra",
    "effortShort.": "Auto",
    "effortShort.xhigh": "XHigh",
    "effortShort.medium": "Med",
    // a step, as the transcript names it
    "tool.Read": "Read",
    "tool.Write": "Write",
    "tool.Edit": "Edit",
    "tool.MultiEdit": "Edit",
    "tool.Bash": "Run",
    "tool.PowerShell": "Run",
    "tool.Glob": "Find files",
    "tool.Grep": "Search",
    "tool.WebFetch": "Open page",
    "tool.WebSearch": "Search the web",
    "tool.Skill": "Use skill",
    "tool.Agent": "Subtask",
    "tool.Task": "Subtask",
    "tool.TodoWrite": "Plan",
    "tool.ToolSearch": "Load tools",
    // what a permission card asks for
    "action.Write": "write a file",
    "action.Edit": "edit a file",
    "action.MultiEdit": "edit a file",
    "action.Bash": "run a command",
    "action.PowerShell": "run a command",
    "action.WebFetch": "open a web page",
    "action.WebSearch": "search the web",
    "action.": "use {tool}",
    // a finished group of steps, in words
    "sum.read": "read {n} file|read {n} files",
    "sum.edit": "edited {n} file|edited {n} files",
    "sum.run": "ran {n} command|ran {n} commands",
    "sum.search": "searched {n} time|searched {n} times",
    "sum.other": "{n} other step|{n} other steps",
  },
  zh: {
    newChat: "新对话",
    placeholder: "给 {agent} 发消息…",
    send: "发送",
    stop: "停止",
    empty: "让 {agent} 在 {app} 里帮你做点什么。",
    thinking: "思考过程",
    working: "正在处理",
    waiting: "{agent} 在等你回应",
    wantsTo: "{agent} 想{action}",
    allow: "允许",
    always: "始终允许",
    deny: "拒绝",
    denyHint: "或者告诉它改怎么做，按回车发送",
    allowed: "已允许",
    denied: "已拒绝",
    cancelled: "已不再等待",
    answered: "已回答",
    skip: "跳过",
    other: "其他答案",
    submit: "提交回答",
    planTitle: "{agent} 提出了一个计划",
    approveEdits: "批准，直接编辑",
    approveAsk: "批准，编辑前先问",
    keepPlanning: "继续完善",
    planHint: "计划里要改什么（可不填）",
    approved: "计划已批准",
    revise: "已要求继续完善",
    stopped: "已停止",
    notInstalled: "这台电脑没有安装 {agent}。先运行 `{install}` 安装，再登录：{login}",
    queued: "已排队，当前回复结束后发送",
    chats: "对话",
    noChats: "还没有对话",
    rename: "重命名",
    renameChat: "重命名这个对话",
    deleteChat: "删除这个对话",
    deleteSure: "再点一次确认删除",
    agent: "Agent",
    notInstalledShort: "未安装",
    signedOutShort: "未登录",
    signedOut: "这台电脑上的 {agent} 看起来还没登录。{login}",
    keepsAgent: "这个对话会一直用 {agent}，已用 {other} 新开一个对话。",
    attachFiles: "添加附件",
    remove: "移除 {name}",
    mode: "权限模式",
    modeHint: "Shift+Tab 切换",
    model: "模型",
    effort: "思考强度",
    asSetUp: "跟随 {agent} 的设置",
    asSetUpShort: "跟随设置",
    asSetUpDesc: "和你在终端里用 {agent} 时一样",
    defaultModel: "默认",
    moreModels: "更多模型",
    modelId: "模型 ID，例如 {id}",
    use: "使用",
    noEffort: "{model} 没有思考强度可选",
    effortNext: "思考强度从下一条消息开始生效",
    tasks: "任务：已完成 {done} / {total}",
    fork: "分叉",
    forkHint: "新开一个对话，从这条回复接着往下",
    copy: "复制",
    copied: "已复制",
    tooBig: "{name} 超过 15 MB，请换一个小一点的文件。",
    context: "上下文",
    contextUse: "{used} / {window} tokens",
    contextNone: "发一条消息后，这里显示这个对话用了多少上下文。",
    contextCompacted: "已压缩。新的用量在下一条回复后显示。",
    contextFull: "快满了。压缩会保留要点、腾出空间。",
    contextAuto: "满了以后 {agent} 会自动压缩。",
    compact: "立即压缩",
    details: "详情",
    usage: "套餐用量",
    usageNone: "第一条回复之后显示套餐用量。",
    fiveHour: "最近 5 小时",
    week: "本周",
    lastHours: "最近 {n} 小时",
    lastDays: "最近 {n} 天",
    resets: "{when} 重置",
    refresh: "刷新",
    ringTip: "上下文和套餐用量",
    sees: "{agent} 知道你正在看",
    commands: "命令",
    cmdModel: "切换模型",
    cmdEffort: "设置思考强度",
    cmdMode: "切换权限模式",
    cmdNew: "新开一个对话",
    cmdRename: "重命名这个对话",
    tookSec: "{n} 秒",
    tookMin: "{m} 分 {s} 秒",
    "effort.": "自动",
    "effortDesc.": "由 {agent} 按任务决定",
    "effort.low": "低",
    "effort.medium": "中",
    "effort.high": "高",
    "effort.xhigh": "很高",
    "effort.max": "最高",
    "effort.ultra": "极致",
    "effortShort.": "自动",
    "effortShort.xhigh": "很高",
    "effortShort.medium": "中",
    "tool.Read": "读取",
    "tool.Write": "写入",
    "tool.Edit": "编辑",
    "tool.MultiEdit": "编辑",
    "tool.Bash": "运行",
    "tool.PowerShell": "运行",
    "tool.Glob": "找文件",
    "tool.Grep": "搜索",
    "tool.WebFetch": "打开网页",
    "tool.WebSearch": "搜索网络",
    "tool.Skill": "使用 skill",
    "tool.Agent": "子任务",
    "tool.Task": "子任务",
    "tool.TodoWrite": "计划",
    "tool.ToolSearch": "加载工具",
    "action.Write": "写入一个文件",
    "action.Edit": "编辑一个文件",
    "action.MultiEdit": "编辑一个文件",
    "action.Bash": "运行一条命令",
    "action.PowerShell": "运行一条命令",
    "action.WebFetch": "打开一个网页",
    "action.WebSearch": "搜索网络",
    "action.": "使用 {tool}",
    "sum.read": "读了 {n} 个文件",
    "sum.edit": "改了 {n} 个文件",
    "sum.run": "运行了 {n} 条命令",
    "sum.search": "搜索了 {n} 次",
    "sum.other": "其他 {n} 步",
    // the built-in agents' text, which the server sends in English (see local())
    "login.claude": "打开终端，运行 `claude`，输入 `/login`，然后在浏览器里完成登录。",
    "login.codex": "打开终端，运行 `codex login`（用 ChatGPT 账号或 API key 登录）。",
    "login.qwen": "打开终端，运行 `qwen`，选择登录方式（`/auth`）。",
    "mode.claude.default": "编辑前先问",
    "mode.claude.acceptEdits": "直接编辑",
    "mode.claude.plan": "先出计划",
    "mode.claude.auto": "自动",
    "mode.claude.bypassPermissions": "跳过所有确认",
    "modeDesc.claude.default": "编辑文件或运行命令前先征求同意",
    "modeDesc.claude.acceptEdits": "直接编辑文件；有风险的命令仍会先问",
    "modeDesc.claude.plan": "只读；先提出计划，你批准后再动手",
    "modeDesc.claude.auto": "由 Claude Code 的安全检查决定，只在有风险时才问",
    "modeDesc.claude.bypassPermissions": "从不询问。只用在丢了也不心疼的文件夹里",
    "mode.codex.default": "编辑前先问",
    "mode.codex.acceptEdits": "直接编辑",
    "mode.codex.plan": "只读",
    "mode.codex.bypassPermissions": "完全访问",
    "modeDesc.codex.default": "运行它不确定是否安全的操作前先问",
    "modeDesc.codex.acceptEdits": "在工作文件夹里直接干活；需要更多权限时再问",
    "modeDesc.codex.plan": "只能查看，不能改动任何东西",
    "modeDesc.codex.bypassPermissions": "从不询问，能改动这台电脑上的任何东西",
  },
};

// the modes whose button wears the warning color
const RISKY = new Set(["bypassPermissions"]);
const MODE_ICON = { default: "hand", acceptEdits: "pen", plan: "map", auto: "spark", bypassPermissions: "alert" };
const EFFORT_ORDER = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"];

// 16 px line icons, drawn on a 16 grid with a 1.5 stroke
const ICON_PATHS = {
  plus: "M8 3v10M3 8h10",
  chevron: "M4.5 6.5 8 10l3.5-3.5",
  chevronRight: "M6.5 4.5 10 8l-3.5 3.5",
  clip: "M10.5 5.5 6 10a1.4 1.4 0 0 0 2 2l5-5a2.8 2.8 0 0 0-4-4L3.8 8.2a4.2 4.2 0 0 0 6 6l3.7-3.7",
  up: "M8 13V3M3.5 7.5 8 3l4.5 4.5",
  stop: "M5 5h6v6H5z",
  check: "M3.5 8.5 6.5 11.5 12.5 4.5",
  copy: "M5.5 5.5h7v7h-7zM3.5 10.5v-7h7",
  fork: "M5 3v6.5M5 9.5c0-2 1.5-3 3.5-3H11M11 3v7M5 13a1.5 1.5 0 1 0 0-.01M11 13a1.5 1.5 0 1 0 0-.01",
  pen: "M10.5 3.5 12.5 5.5 6 12H4v-2z",
  trash: "M3.5 5h9M6.5 5V3.5h3V5M5 5l.6 7.5h4.8L11 5",
  hand: "M5.5 8V4.5a1 1 0 0 1 2 0V7.5M7.5 7V3.5a1 1 0 0 1 2 0V7.5M9.5 7.5V4.5a1 1 0 0 1 2 0V9.5c0 2-1.5 3.5-3.5 3.5S4.8 12 4 10.5L3 8.7a1 1 0 0 1 1.7-1z",
  map: "M3 4.5 6 3.5l4 1.5 3-1v8l-3 1-4-1.5-3 1zM6 3.5v8M10 5v8",
  spark: "M8 2.5 9.3 6.7 13.5 8 9.3 9.3 8 13.5 6.7 9.3 2.5 8 6.7 6.7z",
  alert: "M8 3 13.5 12.5h-11zM8 7v2.5M8 11v.2",
  refresh: "M12.5 6.5A4.5 4.5 0 1 0 12 10M12.5 3.5v3h-3",
};
const icon = (name) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ic");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICON_PATHS[name] ?? "");
  svg.append(p);
  return svg;
};

const CSS = `
:host {
  --sf-ink: #1B1E23; --sf-muted: #6A707A; --sf-line: #E3E6EA; --sf-soft: #F4F5F7;
  --sf-accent: #2F5FD0; --sf-attention: #B26A00; --sf-attention-soft: #FFF6E8; --sf-danger: #B42318;
  --sf-bg: transparent;
  --sf-pop: #FFFFFF; --sf-pop-shadow: 0 10px 28px rgba(16, 24, 40, .14), 0 2px 6px rgba(16, 24, 40, .06);
  --sf-hover: rgba(27, 30, 35, .06);
  --sf-add: #E7F5EC; --sf-add-ink: #1E6B3A; --sf-del: #FCEBEA; --sf-del-ink: #A12A20;
  container-type: inline-size;
  display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%;
  font: inherit; font-size: 13px; line-height: 1.5; color: var(--sf-ink); background: var(--sf-bg);
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    --sf-ink: #E6E8EB; --sf-muted: #9AA1AA; --sf-line: #2E3238; --sf-soft: #1F2226;
    --sf-accent: #7FA2FF; --sf-attention: #E0A43A; --sf-attention-soft: #2A2216; --sf-danger: #F97066;
    --sf-pop: #24272C; --sf-pop-shadow: 0 12px 32px rgba(0, 0, 0, .5), 0 0 0 1px rgba(255, 255, 255, .06);
    --sf-hover: rgba(255, 255, 255, .07);
    --sf-add: #16301F; --sf-add-ink: #8BD3A4; --sf-del: #3A1D1B; --sf-del-ink: #F4A39C;
  }
}
:host([theme="dark"]) {
  --sf-ink: #E6E8EB; --sf-muted: #9AA1AA; --sf-line: #2E3238; --sf-soft: #1F2226;
  --sf-accent: #7FA2FF; --sf-attention: #E0A43A; --sf-attention-soft: #2A2216; --sf-danger: #F97066;
  --sf-pop: #24272C; --sf-pop-shadow: 0 12px 32px rgba(0, 0, 0, .5), 0 0 0 1px rgba(255, 255, 255, .06);
  --sf-hover: rgba(255, 255, 255, .07);
  --sf-add: #16301F; --sf-add-ink: #8BD3A4; --sf-del: #3A1D1B; --sf-del-ink: #F4A39C;
}
* { box-sizing: border-box; }
button, textarea, input { font: inherit; color: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; }
:focus-visible { outline: 2px solid var(--sf-accent); outline-offset: 1px; }
.ic { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.num { font-variant-numeric: tabular-nums; }

/* a button that is only an icon, or an icon and a short word */
.ib { display: inline-flex; align-items: center; gap: 4px; min-width: 0; height: 28px; padding: 0 6px; border: 0; border-radius: 6px; background: none; color: var(--sf-muted); white-space: nowrap; }
.ib:hover:not(:disabled), .ib[aria-expanded="true"] { background: var(--sf-hover); color: var(--sf-ink); }
.ib .lbl { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.ib.risky { color: var(--sf-danger); }

/* ---- the header: which chat, and a new one */
.bar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--sf-line); min-width: 0; }
.chat-btn { flex: 1; justify-content: flex-start; color: var(--sf-ink); font-weight: 600; padding: 0 8px; }
.chat-btn .lbl { flex: 0 1 auto; }
.chat-btn .ic { color: var(--sf-muted); }
.title-input { flex: 1; min-width: 0; height: 28px; border: 1px solid var(--sf-accent); border-radius: 6px; padding: 0 8px; background: transparent; font-weight: 600; outline: 0; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sf-line); flex: none; }
.dot.busy { background: var(--sf-accent); animation: sf-pulse 1.4s ease-in-out infinite; }
.dot.waiting { background: var(--sf-attention); box-shadow: 0 0 0 3px var(--sf-attention-soft); }
.dot.unread { background: var(--sf-accent); }
@keyframes sf-pulse { 50% { opacity: .35; } }

/* ---- the transcript */
.log { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 14px 12px; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.empty { margin: auto 0; color: var(--sf-muted); text-align: center; padding: 24px 8px; }
.empty .who { color: var(--sf-ink); font-weight: 600; font-size: 14px; margin-bottom: 4px; }
.user { align-self: flex-end; max-width: 92%; background: var(--sf-soft); border-radius: 12px 12px 4px 12px; padding: 7px 11px; white-space: pre-wrap; overflow-wrap: anywhere; }
.reply { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.md { overflow-wrap: anywhere; min-width: 0; }
.md > :first-child { margin-top: 0; } .md > :last-child { margin-bottom: 0; }
.md p, .md ul, .md ol, .md pre { margin: 0 0 8px; }
.md ul, .md ol { padding-left: 20px; }
.md code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; background: var(--sf-soft); padding: 1px 4px; border-radius: 4px; }
.md pre { background: var(--sf-soft); padding: 8px 10px; border-radius: 6px; overflow-x: auto; }
.md pre code { background: none; padding: 0; }
.md a { color: var(--sf-accent); }
.md .tbl { overflow-x: auto; margin: 0 0 8px; }
.md table { border-collapse: collapse; font-size: 12px; }
/* "anywhere" (from .md) would let a narrow sidebar squeeze columns to a letter wide, cutting words in
   half; with break-word, words stay whole and a table that does not fit scrolls inside .tbl */
.md th, .md td { border: 1px solid var(--sf-line); padding: 3px 8px; vertical-align: top; min-width: 3em; overflow-wrap: break-word; }
.md th { background: var(--sf-soft); font-weight: 600; }
details.think { color: var(--sf-muted); }
details.think summary { cursor: pointer; width: fit-content; list-style: none; display: flex; align-items: center; gap: 4px; }
details.think summary::-webkit-details-marker { display: none; }
details.think summary .ic { transition: transform .15s; }
details.think[open] summary .ic { transform: rotate(90deg); }
details.think .md { padding: 4px 0 0 12px; border-left: 1px solid var(--sf-line); margin-top: 4px; white-space: pre-wrap; }

/* steps: a finished run of them folds into one line that says what they did */
details.group > summary { cursor: pointer; color: var(--sf-muted); list-style: none; display: flex; align-items: center; gap: 4px; width: fit-content; max-width: 100%; }
details.group > summary::-webkit-details-marker { display: none; }
details.group > summary .ic { transition: transform .15s; }
details.group[open] > summary .ic { transform: rotate(90deg); }
details.group > .steps { margin-top: 6px; }
.steps { display: flex; flex-direction: column; border-left: 1px solid var(--sf-line); margin-left: 3px; }
.step { position: relative; padding: 1px 0 1px 12px; min-width: 0; }
.step::before { content: ""; position: absolute; left: -4px; top: 8px; width: 7px; height: 7px; border-radius: 50%; background: Canvas; border: 1px solid var(--sf-muted); }
.step.done::before { background: var(--sf-muted); }
.step.running::before { border-color: var(--sf-accent); background: var(--sf-accent); animation: sf-pulse 1.4s ease-in-out infinite; }
.step.error::before { border-color: var(--sf-danger); background: var(--sf-danger); }
.step summary { cursor: pointer; display: flex; gap: 6px; min-width: 0; list-style: none; }
.step summary::-webkit-details-marker { display: none; }
.step .name { font-weight: 600; flex: none; }
.step .hint { color: var(--sf-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.step pre { margin: 4px 0 2px; font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; background: var(--sf-soft); padding: 6px 8px; border-radius: 6px; max-height: 220px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }

/* under a reply: how long it took, copy, fork */
.acts { display: flex; align-items: center; gap: 2px; color: var(--sf-muted); font-size: 12px; min-height: 24px; }
.acts .ib { height: 24px; font-size: 12px; opacity: 0; transition: opacity .12s; }
.reply:hover .acts .ib, .acts .ib:focus-visible { opacity: 1; }
@media (hover: none) { .acts .ib { opacity: 1; } }
.acts .took { padding: 0 4px 0 0; }
.workline { display: flex; align-items: center; gap: 8px; color: var(--sf-muted); }
.workline .spin { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--sf-line); border-top-color: var(--sf-accent); animation: sf-spin .9s linear infinite; }
@keyframes sf-spin { to { transform: rotate(360deg); } }

/* ---- cards: the agent waits for the user (the one loud thing) */
.ask { border: 1px solid var(--sf-line); border-left: 3px solid var(--sf-attention); border-radius: 8px; padding: 10px 12px; background: var(--sf-attention-soft); display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ask.settled { background: transparent; border-left-color: var(--sf-line); color: var(--sf-muted); padding: 6px 12px; overflow-wrap: anywhere; }
.ask .title { font-weight: 600; }
.ask .what { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; background: var(--sf-pop); border: 1px solid var(--sf-line); padding: 5px 8px; border-radius: 6px; max-height: 180px; overflow: auto; white-space: pre-wrap; }
.ask .row { display: flex; flex-wrap: wrap; gap: 6px; }
.ask .row button, .ask .opt { border: 1px solid var(--sf-line); background: var(--sf-pop); border-radius: 6px; padding: 4px 10px; }
.ask .row button:hover, .ask .opt:hover { border-color: var(--sf-muted); }
.ask button.primary { background: var(--sf-ink); color: var(--sf-pop); border-color: var(--sf-ink); }
.ask button.primary:hover { opacity: .9; }
.ask button:disabled { opacity: .45; }
.ask .opt[aria-pressed="true"] { border-color: var(--sf-accent); box-shadow: inset 0 0 0 1px var(--sf-accent); }
.ask .q { display: flex; flex-direction: column; gap: 6px; }
.ask .opt { text-align: left; display: flex; flex-direction: column; }
.ask .opt small { color: var(--sf-muted); }
.ask input.say { width: 100%; min-width: 0; border: 1px solid var(--sf-line); background: var(--sf-pop); border-radius: 6px; padding: 5px 8px; }
.diff { font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; border: 1px solid var(--sf-line); border-radius: 6px; max-height: 220px; overflow: auto; background: var(--sf-pop); }
.diff .file { padding: 4px 8px; border-bottom: 1px solid var(--sf-line); color: var(--sf-muted); overflow-wrap: anywhere; }
.diff div.l { padding: 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.diff .add { background: var(--sf-add); color: var(--sf-add-ink); }
.diff .del { background: var(--sf-del); color: var(--sf-del-ink); }
.note, .meta { color: var(--sf-muted); font-size: 12px; }
.error { color: var(--sf-danger); overflow-wrap: anywhere; }

/* ---- the composer */
.composer { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; }
.sees { font-size: 12px; color: var(--sf-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
.box { display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--sf-line); border-radius: 12px; padding: 6px; min-width: 0; background: var(--sf-bg); transition: border-color .12s; }
.box:focus-within { border-color: color-mix(in srgb, var(--sf-accent) 60%, var(--sf-line)); }
.box textarea { min-width: 0; border: 0; outline: 0; resize: none; background: transparent; max-height: 200px; padding: 4px 6px; }
.tools { display: flex; align-items: center; gap: 2px; min-width: 0; }
.tools .grow { flex: 1; min-width: 0; }
.model-btn { max-width: 62%; }
.model-btn .eff { color: var(--sf-muted); padding-left: 6px; border-left: 1px solid var(--sf-line); }
.model-btn:hover .eff { color: inherit; }
.ring { min-width: 28px; padding: 0 6px; justify-content: center; }
.ring .pct { font-size: 12px; }
@container (max-width: 340px) { .ring .pct { display: none; } }
.ring svg { width: 16px; height: 16px; }
.ring circle { fill: none; stroke-width: 2; }
.ring .bg { stroke: var(--sf-line); }
.ring .fg { stroke: var(--sf-muted); stroke-linecap: round; }
.ring.warn .fg { stroke: var(--sf-attention); }
.ring.bad .fg { stroke: var(--sf-danger); }
.send { flex: none; width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: var(--sf-accent); color: #fff; margin-left: 2px; }
.send.stop { background: var(--sf-ink); color: var(--sf-pop); }
.send:disabled { background: var(--sf-line); color: var(--sf-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; padding: 2px 4px 0; }
.chips:empty { display: none; }
.chip { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; font-size: 12px; background: var(--sf-soft); border-radius: 6px; padding: 1px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip .x { border: 0; background: none; padding: 0 2px; color: var(--sf-muted); line-height: 1; }
.user .chips { margin-top: 4px; padding: 0; }
.user .chip { background: var(--sf-pop); }
.tasks:empty { display: none; }
.tasks summary { cursor: pointer; color: var(--sf-muted); font-size: 12px; }
.tasks ul { margin: 4px 0 0; padding: 0 0 0 18px; max-height: 120px; overflow: auto; }
.tasks li { overflow-wrap: anywhere; }
.tasks li.completed { color: var(--sf-muted); text-decoration: line-through; }
.tasks li.in_progress { font-weight: 600; }
@container (max-width: 330px) {
  .mode-btn .lbl { display: none; }
  .model-btn { max-width: 70%; }
}

/* ---- popovers: every menu, the usage panel, the command list */
.pop { position: fixed; z-index: 2147483000; min-width: 220px; max-width: min(340px, calc(100vw - 16px)); overflow-y: auto; overscroll-behavior: contain;
  background: var(--sf-pop); color: var(--sf-ink); border-radius: 10px; box-shadow: var(--sf-pop-shadow); border: 1px solid var(--sf-line); padding: 4px; font-size: 13px; }
.pop:focus { outline: none; }
.pop .head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 6px 8px 4px; color: var(--sf-muted); font-size: 12px; }
.pop .sep { height: 1px; background: var(--sf-line); margin: 4px 2px; }
.mi { display: flex; align-items: flex-start; gap: 8px; width: 100%; border: 0; background: none; border-radius: 6px; padding: 6px 8px; text-align: left; min-width: 0; }
.mi:hover:not(:disabled), .mi:focus-visible, .mi.active { background: var(--sf-hover); outline: none; }
.mi:disabled { opacity: .5; }
.mi > .ic { margin-top: 2px; color: var(--sf-muted); }
.mi .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mi .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi .desc { color: var(--sf-muted); font-size: 12px; overflow-wrap: anywhere; }
.mi .side { flex: none; color: var(--sf-muted); font-size: 12px; display: flex; align-items: center; gap: 6px; min-height: 19px; }
.mi .side .ic { color: var(--sf-accent); }
.mi.danger, .mi.danger > .ic { color: var(--sf-danger); }
.mi .tag { font-size: 11px; color: var(--sf-attention); border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; }
.mi .kbd { font-variant-numeric: tabular-nums; }
.seg { display: flex; gap: 2px; padding: 2px 4px 6px; flex-wrap: wrap; }
.seg button { flex: 1 0 auto; border: 1px solid var(--sf-line); background: none; border-radius: 6px; padding: 3px 6px; font-size: 12px; color: var(--sf-muted); }
.seg button:hover:not(:disabled) { color: var(--sf-ink); border-color: var(--sf-muted); }
.seg button[aria-checked="true"] { color: var(--sf-ink); border-color: var(--sf-accent); box-shadow: inset 0 0 0 1px var(--sf-accent); }
.seg-note { padding: 0 8px 6px; color: var(--sf-muted); font-size: 12px; }
.more-body[hidden] { display: none; }
.custom { display: flex; gap: 4px; padding: 4px 4px 2px; }
.custom input { flex: 1; min-width: 0; border: 1px solid var(--sf-line); border-radius: 6px; padding: 3px 6px; background: transparent; font-size: 12px; }
.custom input.bad { border-color: var(--sf-danger); }
.custom button { border: 1px solid var(--sf-line); background: none; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.cx { padding: 2px 8px 8px; display: flex; flex-direction: column; gap: 4px; }
.cx .line { display: flex; justify-content: space-between; gap: 8px; }
.cx .val { font-variant-numeric: tabular-nums; color: var(--sf-muted); }
.cx .sub { color: var(--sf-muted); font-size: 12px; }
.meter { height: 4px; border-radius: 2px; background: var(--sf-line); overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--sf-muted); border-radius: 2px; }
.meter.warn i { background: var(--sf-attention); }
.meter.bad i { background: var(--sf-danger); }
.cx .row { display: flex; gap: 6px; margin-top: 4px; }
.cx .row button { border: 1px solid var(--sf-line); background: none; border-radius: 6px; padding: 3px 8px; font-size: 12px; }
.cx .row button:hover:not(:disabled) { border-color: var(--sf-muted); }
.cx .row button:disabled { opacity: .45; }
.foot { padding: 6px 8px 4px; border-top: 1px solid var(--sf-line); margin-top: 4px; color: var(--sf-muted); font-size: 12px; display: flex; justify-content: space-between; gap: 8px; }
.foot .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.foot button { border: 0; background: none; color: var(--sf-muted); padding: 0; font-size: 12px; display: inline-flex; gap: 4px; align-items: center; }
.foot button:hover { color: var(--sf-ink); }
.slash .mi .label { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.slash .mi .desc { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .dot.busy, .step.running::before, .workline .spin { animation: none; }
  details .ic, .box { transition: none; }
}
`;

// ---- tiny helpers -----------------------------------------------------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

const fmtK = (n) => (n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n)).replace(".0", "");
const MODEL_ID = /^[A-Za-z0-9][\w.:/\-[\]]{0,120}$/;

/** Just enough markdown for agent replies, built on escaped text (nothing raw reaches innerHTML). */
export function md(src) {
  // an agent on Windows may write \r\n, which would hide its blank lines from the split below
  const blocks = String(src ?? "").replace(/\r\n?/g, "\n").split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g);
  let out = "";
  for (const part of blocks) {
    const fence = part.match(/^```[^\n]*\n([\s\S]*?)(?:```)?$/);
    if (fence) {
      out += `<pre><code>${esc(fence[1].replace(/\n$/, ""))}</code></pre>`;
      continue;
    }
    for (const para of part.split(/\n{2,}/)) {
      if (!para.trim()) continue;
      out += paragraph(para.split("\n"));
    }
  }
  return out;
}

/** A table line's cells, split on `|` outside inline code (`\|` is a literal one); null with no such `|`. */
function cells(line) {
  const s = line.trim();
  const out = [];
  let cell = "";
  let code = false;
  let pipes = 0;
  let endsOnPipe = false;
  for (let i = 0; i < s.length; i++) {
    endsOnPipe = false;
    if (s[i] === "\\" && s[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (s[i] === "|" && !code) {
      out.push(cell.trim());
      cell = "";
      pipes++;
      endsOnPipe = true;
    } else {
      // a lone ` is just a character, not the start of code that never ends
      if (s[i] === "`" && (code || s.includes("`", i + 1))) code = !code;
      cell += s[i];
    }
  }
  if (!pipes) return null;
  if (!endsOnPipe) out.push(cell.trim());
  // the leading and trailing `|` are optional
  if (s.startsWith("|")) out.shift();
  return out;
}

/** a header row with a separator row of as many columns under it (`|---|:--:|`) */
const tableAt = (lines, i) => {
  const head = cells(lines[i]);
  const rule = lines[i + 1] === undefined ? null : cells(lines[i + 1]);
  return !!head?.length && !!rule && rule.length === head.length && rule.every((c) => /^:?-+:?$/.test(c));
};

function paragraph(lines) {
  // agents often put a table right under a sentence, with no blank line between them
  const at = lines.findIndex((_, i) => tableAt(lines, i));
  if (at > 0) return paragraph(lines.slice(0, at)) + paragraph(lines.slice(at));
  if (at === 0) {
    let end = 2;
    while (end < lines.length && cells(lines[end])) end++;
    return table(lines.slice(0, end)) + (end < lines.length ? paragraph(lines.slice(end)) : "");
  }
  if (lines.every((l) => /^\s*[-*] /.test(l))) return "<ul>" + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("") + "</ul>";
  if (lines.every((l) => /^\s*\d+[.)] /.test(l))) return "<ol>" + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)] /, ""))}</li>`).join("") + "</ol>";
  return `<p>${lines.map(inline).join("<br>")}</p>`;
}

/** A GitHub-style table; a wide one scrolls sideways inside its own box, not the sidebar. */
function table([head, rule, ...rows]) {
  const align = cells(rule).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : ""));
  const td = (tag, c, i) => `<${tag}${align[i] ? ` style="text-align:${align[i]}"` : ""}>${breakable(inline(c))}</${tag}>`;
  const width = align.length;
  const row = (l, tag) => "<tr>" + cells(l).slice(0, width).concat(Array(width).fill("")).slice(0, width).map((c, i) => td(tag, c, i)).join("") + "</tr>";
  return `<div class="tbl"><table><thead>${row(head, "th")}</thead><tbody>${rows.map((l) => row(l, "td")).join("")}</tbody></table></div>`;
}

/** Lets a path or URL in a table cell wrap after / ? & = _ (text only, never inside a tag), so one
 *  long path cannot widen its column until the others are a letter wide; words still stay whole. */
const breakable = (html) => html.replace(/(<[^>]*>)|([^<]+)/g, (_, tag, text) => tag ?? text.replace(/(\/|\?|&amp;|=|_)(?=[^\s/])/g, "$1<wbr>"));

function inline(s) {
  const parts = String(s).split(/(`[^`]+`)/g);
  return parts
    .map((p) => {
      if (/^`[^`]+`$/.test(p)) return `<code>${esc(p.slice(1, -1))}</code>`;
      return esc(p)
        .replace(/^#{1,6} (.*)$/, "<strong>$1</strong>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    })
    .join("");
}

// ---- the element -----------------------------------------------------------
class SkillframeChat extends HTMLElement {
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.state = { app: null, chats: [], running: new Set(), unread: new Set(), chatId: null, messages: [], live: null, error: "", screen: null, screenLabel: "", pending: [] };
    this.info = new Map(); // agent id -> what it offers (modes, models, efforts, commands, account, limits)
    this.openSteps = new Set(); // tool steps and groups the user opened: they stay open when the reply redraws
    this.waiters = new Map(); // chatId -> resolve() for ask()
    this.ops = Promise.resolve(); // chat switches run one after another (see serial)
    this.pop = null; // the open popover: { panel, anchor }
    this.slash = null; // the command list while the box starts with "/"
  }

  /**
   * Run actions that change which chat is open one at a time, in the order they were asked for: a
   * pick made while "New chat" is still being created must apply to the new chat, not the old one.
   */
  serial(fn) {
    const run = this.ops.then(fn, fn);
    this.ops = run.catch(() => {});
    return run;
  }

  get endpoint() {
    return (this.getAttribute("endpoint") || "/sf").replace(/\/$/, "");
  }

  get lang() {
    return (this.getAttribute("lang") || navigator.language || "en").slice(0, 2);
  }

  t(key, vars = {}) {
    const s = (STRINGS[this.lang] || STRINGS.en)[key] ?? STRINGS.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }

  /** "one|many" strings by count */
  tn(key, n) {
    const [one, many] = this.t(key, { n }).split("|");
    return n === 1 || many === undefined ? one : many;
  }

  /** text the server sent (in English), in the page's language when this file has it */
  local(key, text) {
    return STRINGS[this.lang]?.[key] ?? text;
  }

  get agents() {
    return this.state.app?.agents ?? [];
  }

  /** the agent new chats start on: the last one picked here, else the first installed one */
  get pickedAgent() {
    let saved = null;
    try {
      saved = localStorage.getItem("skillframe.agent");
    } catch {
      /* storage blocked: fall back */
    }
    const usable = this.agents.filter((a) => a.installed);
    return (usable.find((a) => a.id === saved) ?? usable[0] ?? this.agents[0])?.id;
  }

  /** the current chat's agent (a chat stays with the agent it started on) */
  get agent() {
    const id = this.state.meta?.agent ?? this.pickedAgent;
    return this.agents.find((a) => a.id === id);
  }

  get agentName() {
    return this.agent?.name || "Agent";
  }

  /** the agent the open chat runs on, or new chats start on */
  get agentId() {
    return this.state.meta?.agent ?? this.pickedAgent;
  }

  get agentInfo() {
    const id = this.agentId;
    return id ? this.info.get(id) : null;
  }

  pickAgent(id) {
    return this.serial(() => this.pickAgentNow(id));
  }

  async pickAgentNow(id) {
    try {
      localStorage.setItem("skillframe.agent", id);
    } catch {
      /* not remembered: fine */
    }
    const { meta } = this.state;
    if (meta?.agent === id) return;
    if (this.isFresh()) {
      this.state.meta = await this.api("POST", `/chats/${meta.id}/agent`, { agent: id });
      await this.refreshChats();
      this.render();
    } else {
      const from = this.agentName;
      const chat = await this.api("POST", "/chats", { agent: id });
      Object.assign(this.state, { chatId: chat.id, meta: chat, messages: [], live: null, error: "" });
      await this.refreshChats();
      this.state.notice = meta ? this.t("keepsAgent", { agent: from, other: this.agentName }) : "";
      this.render();
    }
  }

  async connectedCallback() {
    this.root.innerHTML = "";
    this.root.append(h("style", {}, CSS));
    this.bar = h("div", { class: "bar" });
    this.log = h("div", { class: "log", role: "log", "aria-live": "polite" });
    this.composer = this.buildComposer();
    this.root.append(this.bar, this.log, this.composer);
    // a click anywhere else closes the open menu
    this.onDown = (e) => {
      if (!this.pop) return;
      const path = e.composedPath();
      if (!path.includes(this.pop.panel) && !path.includes(this.pop.anchor)) this.closePop();
    };
    this.onResize = () => this.closePop();
    document.addEventListener("pointerdown", this.onDown, true);
    window.addEventListener("resize", this.onResize);
    this.tick = setInterval(() => this.paintWorking(), 1000);
    this.listen();
    this.render(); // the frame at once (header, composer); the data fills in below
    try {
      this.state.app = await this.api("GET", "/app");
      await this.refreshChats();
      if (this.state.chats[0]) await this.open(this.state.chats[0].id);
    } catch (e) {
      this.state.error = e.message;
    }
    this.render();
  }

  disconnectedCallback() {
    this.source?.close();
    clearInterval(this.tick);
    document.removeEventListener("pointerdown", this.onDown, true);
    window.removeEventListener("resize", this.onResize);
    this.closePop();
  }

  // ---- page API ---------------------------------------------------------------
  setScreen(screen, label) {
    this.state.screen = screen;
    if (label !== undefined) {
      this.state.screenLabel = String(label ?? "");
      this.renderExtras();
    }
  }

  newChat() {
    return this.serial(() => this.newChatNow());
  }

  async newChatNow() {
    // the current chat hasn't started: it already is a new chat (no empty chats piling up)
    if (this.isFresh()) return this.state.meta;
    const chat = await this.api("POST", "/chats", { agent: this.pickedAgent });
    // switch at once, from the answer: a pick made right after must see this chat, not the last one
    Object.assign(this.state, { chatId: chat.id, meta: chat, messages: [], live: null, notice: "", error: "" });
    this.render();
    await this.refreshChats();
    this.renderBar();
    return chat;
  }

  /** the open chat has no messages yet (its agent can still change) */
  isFresh() {
    const { meta, messages, live, running } = this.state;
    return !!meta && !meta.sessionId && !messages.length && !live && !running.has(meta.id);
  }

  /** A turn started by the host app's own button. Resolves when the reply is over. */
  async ask({ prompt, shown }) {
    if (!this.state.chatId) await this.newChat();
    const chatId = this.state.chatId;
    const done = new Promise((resolve) => this.waiters.set(chatId, resolve));
    await this.post(prompt, shown);
    return done;
  }

  // ---- server ------------------------------------------------------------------
  async api(method, path, body) {
    const res = await fetch(this.endpoint + path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `${method} ${path}: ${res.status}`);
    return data;
  }

  listen() {
    this.source = new EventSource(this.endpoint + "/events");
    const on = (name, fn) => this.source.addEventListener(name, (e) => fn(JSON.parse(e.data)));
    const mine = (fn) => (d) => {
      if (d.chat === this.state.chatId) fn(d);
    };
    on("chat.start", (d) => {
      this.state.running.add(d.chat);
      if (d.chat === this.state.chatId) {
        if (!this.pendingEcho) this.state.messages.push(d.message);
        this.pendingEcho = false;
        this.state.live = { blocks: [], queue: [], startedAt: d.startedAt };
      }
      this.render();
    });
    on("chat.next", mine((d) => {
      this.state.messages.push(d.message);
      this.state.live = { blocks: [], queue: d.queue, startedAt: d.startedAt };
      this.render();
    }));
    on("chat.delta", mine((d) => {
      const live = this.ensureLive();
      const last = live.blocks[live.blocks.length - 1];
      if (last && last.type === d.kind) last.text += d.text;
      else live.blocks.push({ type: d.kind, text: d.text });
      this.renderLive();
    }));
    const upsert = (block) => {
      const live = this.ensureLive();
      const i = live.blocks.findIndex((b) => b.type === block.type && b.id === block.id);
      if (i >= 0) live.blocks[i] = block;
      else live.blocks.push(block);
      this.renderLive();
    };
    on("chat.tool", mine((d) => upsert(d.tool)));
    on("chat.ask", (d) => {
      if (d.chat === this.state.chatId) upsert(d.ask);
      else this.renderBar();
    });
    on("chat.block", mine((d) => {
      this.ensureLive().blocks.push(d.block);
      this.renderLive();
    }));
    on("chat.queue", mine((d) => {
      this.ensureLive().queue = d.queue;
      this.renderLive();
    }));
    on("chat.reply", mine(() => this.open(this.state.chatId, true)));
    on("chat.done", (d) => {
      this.state.running.delete(d.chat);
      if (d.chat !== this.state.chatId) this.state.unread.add(d.chat);
      const resolve = this.waiters.get(d.chat);
      if (resolve) {
        this.waiters.delete(d.chat);
        resolve({ ok: d.ok, error: d.error });
      }
      this.dispatchEvent(new CustomEvent("chat-done", { detail: d }));
      if (d.chat === this.state.chatId) this.open(d.chat, true);
      this.refreshChats().then(() => this.renderBar());
    });
    on("chat.tasks", mine((d) => {
      if (this.state.meta) this.state.meta.tasks = d.tasks;
      this.renderExtras();
    }));
    on("chat.meta", (d) => {
      const i = this.state.chats.findIndex((c) => c.id === d.chat);
      if (i >= 0 && d.meta) this.state.chats[i] = d.meta;
      if (d.chat === this.state.chatId && d.meta) this.state.meta = d.meta;
      this.renderBar();
      this.renderExtras();
    });
    on("agent.info", (d) => {
      this.info.set(d.agent, { ...this.info.get(d.agent), modes: d.modes, models: d.models.map((m) => ({ efforts: [], ...m })) });
      this.renderExtras();
    });
    on("agent.limits", (d) => {
      this.info.set(d.agent, { ...this.info.get(d.agent), limits: d.limits });
      this.renderExtras();
    });
    // a shared file changed (the agent edited it, or the app wrote it): the page redraws
    on("file.changed", (d) => this.dispatchEvent(new CustomEvent("file-changed", { detail: d })));
    // sf.publish(name, data) on the server: handed to the page as an "sf:<name>" event on this element
    on("sf", (d) => this.dispatchEvent(new CustomEvent(`sf:${d.name}`, { detail: d.data })));
  }

  ensureLive() {
    if (!this.state.live) this.state.live = { blocks: [], queue: [], startedAt: Date.now() / 1000 };
    return this.state.live;
  }

  async refreshChats() {
    const r = await this.api("GET", "/chats");
    this.state.chats = r.chats;
    this.state.running = new Set(r.running);
  }

  async open(chatId, quiet) {
    const r = await this.api("GET", `/chats/${chatId}`);
    // a quiet refresh that comes back after the user moved to another chat would take them back
    if (quiet && chatId !== this.state.chatId) return;
    this.state.chatId = chatId;
    this.state.unread.delete(chatId);
    this.state.meta = r.meta;
    this.state.messages = r.messages;
    if (!quiet) this.state.notice = "";
    this.state.live = r.live;
    if (!quiet) this.state.error = "";
    this.render();
  }

  /** what an agent offers, once per agent (asked again with refresh) */
  async loadInfo(agentId, refresh = false) {
    if (!agentId || (this.info.has(agentId) && !refresh)) return;
    if (!this.info.has(agentId)) this.info.set(agentId, { modes: [], models: [], commands: [], loading: true });
    try {
      this.info.set(agentId, await this.api("GET", `/agents/${agentId}/options${refresh ? "?refresh=1" : ""}`));
    } catch {
      if (this.info.get(agentId)?.loading) this.info.delete(agentId);
    }
    this.renderExtras();
  }

  async changeSetting(change) {
    try {
      if (!this.state.chatId) await this.newChat();
      this.state.meta = await this.api("POST", `/chats/${this.state.chatId}/settings`, change);
      if ("effort" in change && this.isBusy()) this.state.notice = this.t("effortNext");
    } catch (e) {
      this.state.error = e.message;
    }
    this.render();
  }

  fork(at) {
    return this.serial(() => this.forkNow(at));
  }

  async forkNow(at) {
    try {
      const chat = await this.api("POST", `/chats/${this.state.chatId}/fork`, { at });
      await this.refreshChats();
      await this.open(chat.id);
    } catch (e) {
      this.state.error = e.message;
      this.render();
    }
  }

  async rename(title) {
    title = title.trim();
    if (!title || !this.state.chatId) return;
    try {
      this.state.meta = await this.api("POST", `/chats/${this.state.chatId}/title`, { title });
      await this.refreshChats();
    } catch (e) {
      this.state.error = e.message;
    }
    this.render();
  }

  async deleteChat() {
    const id = this.state.chatId;
    if (!id) return;
    try {
      await this.api("DELETE", `/chats/${id}`);
      await this.refreshChats();
      const next = this.state.chats[0];
      if (next) await this.open(next.id);
      else Object.assign(this.state, { chatId: null, meta: null, messages: [], live: null });
    } catch (e) {
      this.state.error = e.message;
    }
    this.render();
  }

  // ---- attachments -------------------------------------------------------------
  async attach(fileList) {
    for (const file of fileList) {
      if (file.size > 15 * 1024 * 1024) {
        this.state.error = this.t("tooBig", { name: file.name });
        this.render();
        continue;
      }
      try {
        if (!this.state.chatId) await this.newChat();
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const saved = await this.api("POST", `/chats/${this.state.chatId}/upload`, { name: file.name || "pasted.png", type: file.type, data });
        this.state.pending.push(saved);
      } catch (e) {
        this.state.error = e.message;
      }
    }
    this.render();
  }

  async post(text, shown) {
    this.state.error = "";
    let echo = null;
    try {
      if (!this.state.chatId) await this.newChat();
      const running = this.state.running.has(this.state.chatId);
      if (!running) {
        // shown at once; chat.start would add it again
        echo = { role: "user", text: shown ?? text, at: Date.now() / 1000, files: this.state.pending };
        this.state.messages.push(echo);
        this.pendingEcho = true;
        this.render();
      }
      const files = this.state.pending;
      await this.api("POST", `/chats/${this.state.chatId}/send`, { text, shown, screen: this.state.screen, files });
      this.state.pending = [];
      this.renderExtras();
    } catch (e) {
      this.pendingEcho = false;
      this.state.messages = this.state.messages.filter((m) => m !== echo);
      this.state.error = e.message;
      this.render();
      throw e;
    }
  }

  // ---- popovers ----------------------------------------------------------------
  /**
   * A menu or panel next to `anchor`, above it when there's more room there (the composer sits at
   * the bottom). `build(panel)` fills it. Arrow keys move between its items, 1-9 pick one, Esc closes.
   */
  openPop(anchor, build, { cls = "", passive = false, label = "", focusPanel = false } = {}) {
    if (this.pop?.anchor === anchor && !passive) return this.closePop();
    this.closePop();
    const panel = h("div", { class: `pop ${cls}`, role: passive ? "listbox" : focusPanel ? "dialog" : "menu", "aria-label": label || undefined, tabindex: "-1" });
    build(panel);
    this.root.append(panel);
    this.pop = { panel, anchor, passive };
    anchor.setAttribute?.("aria-expanded", "true");
    this.place();
    if (!passive) {
      panel.addEventListener("keydown", (e) => this.popKeys(e));
      // a menu: the picked item (the next key acts on it). A panel to read: the panel itself
      const items = focusPanel ? [] : this.popItems();
      const picked = (b) => b.getAttribute("aria-checked") === "true" && b.offsetParent;
      (items.find((b) => b.classList.contains("mi") && picked(b)) ?? items.find(picked) ?? items[0] ?? panel).focus({ preventScroll: true });
    }
    return panel;
  }

  place() {
    if (!this.pop) return;
    const { panel, anchor } = this.pop;
    const r = anchor.getBoundingClientRect();
    const vw = innerWidth;
    const vh = innerHeight;
    panel.style.maxHeight = "";
    const pw = Math.min(panel.offsetWidth, vw - 16);
    const above = r.top > vh - r.bottom;
    const room = (above ? r.top : vh - r.bottom) - 14;
    panel.style.maxHeight = `${Math.max(120, room)}px`;
    const ph = Math.min(panel.offsetHeight, Math.max(120, room));
    const alignEnd = r.left + r.width / 2 > vw / 2;
    const left = Math.max(8, Math.min(vw - pw - 8, alignEnd ? r.right - pw : r.left));
    panel.style.left = `${left}px`;
    panel.style.top = `${above ? Math.max(8, r.top - ph - 6) : r.bottom + 6}px`;
  }

  closePop() {
    if (!this.pop) return;
    const { panel, anchor, passive } = this.pop;
    this.pop = null;
    this.slash = null;
    panel.remove();
    anchor.setAttribute?.("aria-expanded", "false");
    // focus goes back where it came from, unless it already moved on
    if (!passive && this.root.activeElement && panel.contains(this.root.activeElement)) anchor.focus?.({ preventScroll: true });
    else if (!passive && !this.root.activeElement) anchor.focus?.({ preventScroll: true });
  }

  popItems() {
    return this.pop ? [...this.pop.panel.querySelectorAll(".mi:not(:disabled), .seg button:not(:disabled), .custom input, .custom button, .cx button:not(:disabled), .foot button")].filter((b) => b.offsetParent) : [];
  }

  popKeys(e) {
    if (e.target.tagName === "INPUT" && !["Escape", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const items = this.popItems();
    const i = items.indexOf(this.root.activeElement);
    const go = (n) => items[(n + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? -1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(-1);
    else if (e.key === "Escape") this.closePop();
    else if (e.key === "Tab") this.closePop();
    else if (/^[1-9]$/.test(e.key)) {
      const hit = this.pop.panel.querySelector(`[data-num="${e.key}"]:not(:disabled)`);
      if (!hit) return;
      hit.click();
    } else return;
    if (e.key !== "Tab") e.preventDefault();
  }

  /** one row of a menu */
  item({ label, desc, side, checked, disabled, danger, num, ic, tag, onPick, keep }) {
    const b = h("button", {
      type: "button", class: `mi${danger ? " danger" : ""}`, role: checked === undefined ? "menuitem" : "menuitemradio",
      "aria-checked": checked === undefined ? undefined : String(!!checked), disabled: !!disabled, "data-num": num ? String(num) : undefined,
      onclick: () => {
        if (!keep) this.closePop();
        onPick?.();
      },
    },
    ic ? icon(ic) : null,
    h("span", { class: "main" }, h("span", { class: "label" }, label), desc ? h("span", { class: "desc" }, desc) : null),
    h("span", { class: "side" }, tag ? h("span", { class: "tag" }, tag) : null, side ?? null, checked ? icon("check") : num ? h("span", { class: "kbd" }, String(num)) : null));
    return b;
  }

  // ---- the chat menu (header) ------------------------------------------------------
  openChatMenu(anchor) {
    this.openPop(anchor, (p) => {
      p.append(this.item({ label: this.t("newChat"), ic: "plus", onPick: () => this.newChat().catch((e) => this.fail(e)) }));
      p.append(h("div", { class: "sep" }), h("div", { class: "head" }, this.t("chats")));
      const { chats, chatId } = this.state;
      if (!chats.length) p.append(h("div", { class: "seg-note" }, this.t("noChats")));
      chats.slice(0, 60).forEach((c, i) => {
        const agent = this.agents.find((a) => a.id === c.agent);
        const desc = [this.ago(c.updatedAt), this.agents.length > 1 ? agent?.name : ""].filter(Boolean).join(", ");
        p.append(this.item({
          label: c.title || this.t("newChat"), desc, checked: c.id === chatId, num: i < 9 ? i + 1 : undefined,
          side: h("span", { class: `dot ${this.chatState(c.id)}` }),
          onPick: () => this.serial(() => this.open(c.id)),
        }));
      });
      if (this.state.meta && !this.isFresh()) {
        p.append(h("div", { class: "sep" }));
        p.append(this.item({ label: this.t("renameChat"), ic: "pen", onPick: () => this.startRename() }));
        const del = this.item({ label: this.t("deleteChat"), ic: "trash", danger: true, keep: true, onPick: () => {
          // twice: deleting can't be undone
          if (del.dataset.sure) {
            this.closePop();
            this.deleteChat();
          } else {
            del.dataset.sure = "1";
            del.querySelector(".label").textContent = this.t("deleteSure");
          }
        } });
        p.append(del);
      }
    }, { label: this.t("chats") });
  }

  chatState(id) {
    if (id === this.state.chatId && this.state.live?.blocks?.some((b) => b.type === "ask" && b.status === "pending")) return "waiting";
    if (this.state.running.has(id)) return "busy";
    if (this.state.unread.has(id)) return "unread";
    return "";
  }

  ago(sec) {
    if (!sec) return "";
    const min = (Date.now() / 1000 - sec) / 60;
    const rtf = new Intl.RelativeTimeFormat(this.lang, { numeric: "auto", style: "short" });
    if (min < 1) return rtf.format(0, "minute");
    if (min < 60) return rtf.format(-Math.floor(min), "minute");
    if (min < 60 * 24) return rtf.format(-Math.floor(min / 60), "hour");
    return new Date(sec * 1000).toLocaleDateString(this.lang);
  }

  startRename() {
    const input = h("input", { class: "title-input", value: this.state.meta?.title || "", "aria-label": this.t("renameChat"), maxlength: "120" });
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const title = input.value.trim();
      input.remove(); // the header redraws only without the field in it
      this.renderBar();
      if (save && title && title !== this.state.meta?.title) this.rename(title);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    this.chatBtn.replaceWith(input);
    input.focus();
    input.select();
  }

  // ---- model, effort, agent ------------------------------------------------------------
  /** the model the next message uses: { name, efforts, picked } */
  currentModel() {
    const info = this.agentInfo;
    const meta = this.state.meta;
    const models = info?.models ?? [];
    if (meta?.model) {
      const m = models.find((x) => x.id === meta.model);
      return { name: m?.name ?? meta.model, efforts: m?.efforts ?? [], picked: true };
    }
    // with none picked: the agent's default (what it last said it ran, or what it says its default is)
    const fallback = info?.defaultModel || (meta?.modelUsed && !/^fake|<synthetic>/.test(meta.modelUsed) ? meta.modelUsed : "") || this.t("defaultModel");
    const known = models.find((x) => x.name === info?.defaultModel || x.id === meta?.modelUsed);
    const efforts = known?.efforts ?? [...new Set(models.flatMap((m) => m.efforts ?? []))];
    return { name: fallback, efforts, picked: false };
  }

  effortLabel(level, short = false) {
    const k = short ? `effortShort.${level ?? ""}` : `effort.${level ?? ""}`;
    const own = STRINGS[this.lang]?.[k] ?? STRINGS.en[k];
    if (own) return own;
    if (short) return this.effortLabel(level);
    return level ? level[0].toUpperCase() + level.slice(1) : this.t("effort.");
  }

  openModelMenu(anchor, focusEffort = false) {
    const info = this.agentInfo ?? { models: [] };
    const meta = this.state.meta;
    const cur = this.currentModel();
    const panel = this.openPop(anchor, (p) => {
      // the agent: fixed once a chat has started (a new chat starts on the other one)
      if (this.agents.length > 1) {
        p.append(h("div", { class: "head" }, this.t("agent")));
        for (const a of this.agents) {
          p.append(this.item({
            label: a.name,
            desc: !a.installed ? a.install : a.signedIn === false ? this.local(`login.${a.id}`, a.login).replace(/`/g, "") : undefined,
            tag: !a.installed ? this.t("notInstalledShort") : a.signedIn === false ? this.t("signedOutShort") : undefined,
            checked: a.id === this.agent?.id, disabled: !a.installed,
            onPick: () => this.pickAgent(a.id).catch((e) => this.fail(e)),
          }));
        }
        p.append(h("div", { class: "sep" }));
      }
      p.append(h("div", { class: "head" }, this.t("model")));
      let n = 1;
      const pick = (id) => {
        const m = info.models.find((x) => x.id === id);
        const change = { model: id };
        // an effort the new model can't do goes back to auto
        if (meta?.effort && m && !m.efforts.includes(meta.effort)) change.effort = "";
        this.changeSetting(change);
      };
      p.append(this.item({ label: this.t("defaultModel"), desc: info.defaultModel || this.t("asSetUpDesc", { agent: this.agentName }), checked: !meta?.model, num: n++, onPick: () => this.changeSetting({ model: "" }) }));
      for (const m of info.models.filter((x) => !x.more)) p.append(this.item({ label: m.name, desc: m.desc, checked: meta?.model === m.id, num: n < 10 ? n++ : undefined, onPick: () => pick(m.id) }));
      // older models and any id the agent takes
      const body = h("div", { class: "more-body", hidden: true });
      const moreBtn = h("button", { type: "button", class: "mi more", "aria-expanded": "false", onclick: () => {
        body.hidden = !body.hidden;
        moreBtn.setAttribute("aria-expanded", String(!body.hidden));
        moreBtn.querySelector(".ic").style.transform = body.hidden ? "" : "rotate(90deg)";
        this.place();
      } }, h("span", { class: "main" }, h("span", { class: "label" }, this.t("moreModels"))), icon("chevronRight"));
      for (const m of info.models.filter((x) => x.more)) body.append(this.item({ label: m.name, desc: m.desc, checked: meta?.model === m.id, onPick: () => pick(m.id) }));
      const example = { claude: "claude-opus-4-1", codex: "gpt-5-codex" }[this.agentId] ?? "model-id";
      const custom = h("input", { placeholder: this.t("modelId", { id: example }), spellcheck: "false", "aria-label": this.t("modelId", { id: example }),
        value: meta?.model && !info.models.some((m) => m.id === meta.model) ? meta.model : "" });
      const useCustom = () => {
        const v = custom.value.trim();
        if (!MODEL_ID.test(v)) return custom.classList.add("bad");
        this.closePop();
        this.changeSetting({ model: v });
      };
      custom.addEventListener("keydown", (e) => {
        if (e.key === "Enter") useCustom();
      });
      custom.addEventListener("input", () => custom.classList.remove("bad"));
      body.append(h("div", { class: "custom" }, custom, h("button", { type: "button", onclick: useCustom }, this.t("use"))));
      if (meta?.model && !info.models.some((m) => m.id === meta.model && !m.more)) {
        body.hidden = false;
        moreBtn.setAttribute("aria-expanded", "true");
      }
      p.append(moreBtn, body);
      // effort: one row of levels, the ones this model has
      p.append(h("div", { class: "sep" }), h("div", { class: "head" }, this.t("effort"), h("span", {}, cur.efforts.length ? this.effortLabel(meta?.effort) : "")));
      if (!cur.efforts.length) p.append(h("div", { class: "seg-note" }, this.t("noEffort", { model: cur.name })));
      else {
        const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": this.t("effort") });
        const levels = ["", ...EFFORT_ORDER.filter((l) => cur.efforts.includes(l)), ...cur.efforts.filter((l) => !EFFORT_ORDER.includes(l))];
        for (const l of levels) {
          seg.append(h("button", { type: "button", role: "radio", "aria-checked": String((meta?.effort ?? "") === l), title: l ? this.effortLabel(l) : this.t("effortDesc.", { agent: this.agentName }),
            onclick: () => {
              this.closePop();
              this.changeSetting({ effort: l });
            } }, this.effortLabel(l, true)));
        }
        p.append(seg);
      }
    }, { label: this.t("model") });
    if (focusEffort) panel?.querySelector(".seg button[aria-checked='true']")?.focus();
  }

  // ---- permission mode ------------------------------------------------------------
  modes() {
    return this.agentInfo?.modes ?? [];
  }

  modeName(id) {
    const m = this.modes().find((x) => x.id === id);
    return m ? this.local(`mode.${this.agentId}.${id}`, m.name) : "";
  }

  openModeMenu(anchor) {
    const meta = this.state.meta;
    this.openPop(anchor, (p) => {
      p.append(h("div", { class: "head" }, this.t("mode"), h("span", {}, this.t("modeHint"))));
      this.modes().forEach((m, i) => p.append(this.item({
        label: this.modeName(m.id), desc: m.desc ? this.local(`modeDesc.${this.agentId}.${m.id}`, m.desc) : undefined,
        ic: MODE_ICON[m.id] ?? "hand", danger: RISKY.has(m.id), checked: meta?.mode === m.id, num: i + 1,
        onPick: () => this.changeSetting({ mode: m.id }),
      })));
      p.append(h("div", { class: "sep" }), this.item({ label: this.t("asSetUp", { agent: this.agentName }), desc: this.t("asSetUpDesc", { agent: this.agentName }), checked: !meta?.mode, onPick: () => this.changeSetting({ mode: "" }) }));
    }, { label: this.t("mode") });
  }

  /** Shift+Tab, like the terminal: the next of the everyday modes */
  cycleMode() {
    const ids = this.modes().map((m) => m.id).filter((id) => !RISKY.has(id) && id !== "auto");
    if (!ids.length) return;
    const cur = this.state.meta?.mode;
    this.changeSetting({ mode: ids[(ids.indexOf(cur) + 1) % ids.length] });
  }

  // ---- context and plan usage ---------------------------------------------------------
  contextUse() {
    const c = this.state.meta?.context;
    const known = !!(c && c.window > 0 && Number.isFinite(c.used));
    return { c, known, p: known ? Math.min(1, c.used / c.window) : 0 };
  }

  openUsage(anchor) {
    const { c, known, p } = this.contextUse();
    const info = this.agentInfo ?? {};
    const lim = info.limits?.windows ?? {};
    const isClaude = this.agentId === "claude";
    const meter = (v) => h("div", { class: `meter${v >= 0.9 ? " bad" : v >= 0.7 ? " warn" : ""}` }, h("i", { style: `width:${Math.round(Math.min(1, v) * 100)}%` }));
    const when = (sec) => {
      if (!sec) return "";
      const d = new Date(sec * 1000);
      const same = d.toDateString() === new Date().toDateString();
      return same ? d.toLocaleTimeString(this.lang, { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleString(this.lang, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };
    const windowRow = (key, w) => {
      const label = key === "five_hour" ? this.t("fiveHour") : key === "seven_day" ? this.t("week")
        : w.minutes >= 1440 ? this.t("lastDays", { n: Math.round(w.minutes / 1440) }) : this.t("lastHours", { n: Math.round((w.minutes || 0) / 60) });
      return h("div", { class: "cx" }, h("div", { class: "line" }, h("span", {}, label), h("span", { class: "val" }, `${Math.round(w.utilization * 100)}%`)),
        meter(w.utilization), w.resetsAt ? h("div", { class: "sub" }, this.t("resets", { when: when(w.resetsAt) })) : null);
    };
    const send = (cmd) => {
      this.closePop();
      this.post(cmd).catch(() => {});
    };
    this.openPop(anchor, (panel) => {
      panel.append(h("div", { class: "head" }, this.t("context")));
      if (known) {
        panel.append(h("div", { class: "cx" },
          h("div", { class: "line" }, h("span", { class: "num" }, this.t("contextUse", { used: fmtK(c.used), window: fmtK(c.window) })), h("span", { class: "val" }, `${Math.round(p * 100)}%`)),
          meter(p),
          h("div", { class: "sub" }, p >= 0.7 ? this.t("contextFull") : this.t("contextAuto", { agent: this.agentName })),
          isClaude ? h("div", { class: "row" },
            h("button", { type: "button", disabled: this.isBusy(), onclick: () => send("/compact") }, this.t("compact")),
            h("button", { type: "button", disabled: this.isBusy(), onclick: () => send("/context") }, this.t("details"))) : null));
      } else panel.append(h("div", { class: "cx" }, h("div", { class: "sub" }, c?.compacted ? this.t("contextCompacted") : this.t("contextNone"))));
      const keys = Object.keys(lim).sort((a, b) => (a === "five_hour" ? -1 : b === "five_hour" ? 1 : a === "seven_day" ? -1 : 1));
      panel.append(h("div", { class: "sep" }), h("div", { class: "head" }, this.t("usage")));
      if (keys.length) keys.forEach((k) => panel.append(windowRow(k, lim[k])));
      else panel.append(h("div", { class: "cx" }, h("div", { class: "sub" }, this.t("usageNone"))));
      const acct = info.account;
      panel.append(h("div", { class: "foot" },
        h("span", { class: "who", title: acct?.email || "" }, [acct?.plan, acct?.email].filter(Boolean).join(", ") || this.agentName),
        h("button", { type: "button", onclick: async () => {
          await this.loadInfo(this.agentId, true);
          if (this.pop?.anchor === anchor) {
            this.closePop();
            this.openUsage(anchor);
          }
        } }, icon("refresh"), this.t("refresh"))));
    }, { label: this.t("ringTip"), focusPanel: true });
  }

  // ---- slash commands -----------------------------------------------------------------
  /** the commands this sidebar runs itself, then the agent's own (its skills too) */
  commandList() {
    const local = [
      { name: "model", desc: this.t("cmdModel"), hint: "[model]", local: true },
      { name: "effort", desc: this.t("cmdEffort"), hint: "[auto|low|medium|high|xhigh|max]", local: true },
      { name: "mode", desc: this.t("cmdMode"), hint: "", local: true },
      { name: "new", desc: this.t("cmdNew"), hint: "", local: true },
      { name: "rename", desc: this.t("cmdRename"), hint: "<name>", local: true },
    ];
    const own = (this.agentInfo?.commands ?? []).filter((c) => !local.some((l) => l.name === c.name));
    return [...local, ...own];
  }

  updateSlash() {
    const v = this.input.value;
    const m = v.match(/^\/(\S*)$/);
    if (!m) {
      if (this.slash) this.closePop();
      return;
    }
    const q = m[1].toLowerCase();
    const list = this.commandList().filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
      .slice(0, 40);
    if (!list.length) {
      if (this.slash) this.closePop();
      return;
    }
    const active = Math.min(this.slash?.active ?? 0, list.length - 1);
    if (this.pop && !this.slash) this.closePop();
    if (this.slash) this.pop.panel.remove();
    this.pop = null;
    this.openPop(this.boxNode, (p) => {
      p.append(h("div", { class: "head" }, this.t("commands")));
      list.forEach((c, i) => {
        const b = this.item({ label: `/${c.name}${c.hint ? " " + c.hint : ""}`, desc: c.desc, onPick: () => this.applySlash(c) });
        b.tabIndex = -1;
        b.id = `slash-${i}`;
        if (i === active) b.classList.add("active");
        p.append(b);
      });
    }, { cls: "slash", passive: true });
    this.pop.panel.style.width = `${this.boxNode.getBoundingClientRect().width}px`;
    this.place();
    this.slash = { list, active };
    this.pop.panel.querySelector(".mi.active")?.scrollIntoView({ block: "nearest" });
  }

  moveSlash(d) {
    const { list, active } = this.slash;
    this.slash.active = (active + d + list.length) % list.length;
    this.pop.panel.querySelectorAll(".mi").forEach((b, i) => b.classList.toggle("active", i === this.slash.active));
    this.pop.panel.querySelector(".mi.active")?.scrollIntoView({ block: "nearest" });
  }

  applySlash(c = this.slash?.list[this.slash.active]) {
    if (!c) return;
    this.closePop();
    if (c.local && !c.hint) {
      this.input.value = "";
      this.autosize();
      this.runLocal(`/${c.name}`);
      return;
    }
    this.input.value = `/${c.name} `;
    this.input.focus();
    this.autosize();
  }

  /** /model, /effort, /mode, /new, /rename run here; true when handled */
  runLocal(text) {
    const m = text.match(/^\/(model|effort|mode|new|clear|rename)(?:\s+(.*))?$/s);
    if (!m) return false;
    const [, cmd, rawArg] = m;
    const arg = (rawArg ?? "").trim();
    const bar = this.composer.querySelector(".tools");
    if (cmd === "new" || cmd === "clear") this.newChat().catch((e) => this.fail(e));
    else if (cmd === "rename") {
      if (arg) this.rename(arg);
      else this.startRename();
    } else if (cmd === "mode") this.openModeMenu(bar.querySelector(".mode-btn") ?? bar);
    else if (cmd === "model") {
      if (arg && MODEL_ID.test(arg)) this.changeSetting({ model: arg });
      else this.openModelMenu(bar.querySelector(".model-btn") ?? bar);
    } else if (cmd === "effort") {
      const level = arg === "auto" ? "" : arg;
      if (arg && (level === "" || this.currentModel().efforts.includes(level))) this.changeSetting({ effort: level });
      else this.openModelMenu(bar.querySelector(".model-btn") ?? bar, true);
    }
    return true;
  }

  fail(e) {
    this.state.error = e.message;
    this.render();
  }

  // ---- rendering --------------------------------------------------------------
  render() {
    this.renderBar();
    this.log.replaceChildren();
    const { messages, error } = this.state;
    if (!messages.length && !this.state.live && this.state.app) {
      const a = this.agent;
      const login = a && this.local(`login.${a.id}`, a.login);
      const hint = a && !a.installed ? this.t("notInstalled", { agent: a.name, install: a.install, login })
        : a && a.signedIn === false ? this.t("signedOut", { agent: a.name, login })
        : this.t("empty", { agent: this.agentName, app: this.state.app?.appName || "this app" });
      this.log.append(h("div", { class: "empty" }, h("div", { class: "who" }, this.agentName), h("div", { html: md(hint) })));
    }
    if (this.state.notice) this.log.prepend(h("div", { class: "note" }, this.state.notice));
    const lastReply = messages.map((m) => m.role).lastIndexOf("assistant");
    messages.forEach((m, i) => this.log.append(m.role === "user" ? this.renderUser(m) : this.renderReply(m, i, i === lastReply)));
    this.liveNode = h("div", { class: "reply" });
    this.log.append(this.liveNode);
    this.renderLive(true);
    if (error) this.log.append(h("div", { class: "error", html: md(error) }));
    this.renderExtras();
    this.scrollDown(true);
  }

  renderLive(skipScroll) {
    if (!this.liveNode) return;
    const live = this.state.live;
    this.liveNode.replaceChildren();
    if (live) {
      this.liveNode.append(...this.renderBlocks(live.blocks, true));
      const waiting = live.blocks.some((b) => b.type === "ask" && b.status === "pending");
      if (!waiting && this.isBusy()) {
        this.workNode = h("div", { class: "workline" }, h("span", { class: "spin" }), h("span", { class: "num" }));
        this.liveNode.append(this.workNode);
        this.paintWorking();
      }
      for (const q of live.queue || []) this.liveNode.append(h("div", { class: "user" }, q.msg.text), h("div", { class: "note" }, this.t("queued")));
    }
    this.renderBar();
    this.updateComposer();
    if (!skipScroll) this.scrollDown();
  }

  /** "Working 12s": the time keeps moving, so a long step never looks stuck */
  paintWorking() {
    const el = this.workNode?.querySelector(".num");
    if (!el || !this.workNode.isConnected) return;
    const from = this.state.live?.startedAt ?? Date.now() / 1000;
    el.textContent = `${this.t("working")} ${this.took(Math.max(0, Date.now() / 1000 - from))}`;
  }

  took(sec) {
    const s = Math.round(sec);
    return s < 60 ? this.t("tookSec", { n: s }) : this.t("tookMin", { m: Math.floor(s / 60), s: s % 60 });
  }

  renderUser(m) {
    const files = (m.files || []).map((f) => h("span", { class: "chip", title: f.name }, f.name));
    return h("div", { class: "user" }, m.text, files.length ? h("div", { class: "chips" }, files) : null);
  }

  renderReply(m, index, last) {
    const node = h("div", { class: "reply" }, ...this.renderBlocks(m.blocks || [], false));
    if (m.cancelled) node.append(h("div", { class: "note" }, this.t("stopped")));
    if (m.error) node.append(h("div", { class: "error", html: md(m.error) }));
    // an agent that isn't signed in says so in its own words: add how to sign in to it
    if (m.error && /auth|log ?in|sign ?in|credential|api key/i.test(m.error) && this.agent?.login) node.append(h("div", { class: "note", html: md(this.local(`login.${this.agent.id}`, this.agent.login)) }));
    const acts = h("div", { class: "acts" });
    if (m.took) acts.append(h("span", { class: "took num" }, this.took(m.took)));
    const text = (m.blocks || []).filter((b) => b.type === "text").map((b) => b.text).join("\n\n").trim();
    if (text) {
      const copy = h("button", { type: "button", class: "ib", title: this.t("copy"), onclick: async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.querySelector(".lbl").textContent = this.t("copied");
          setTimeout(() => copy.isConnected && (copy.querySelector(".lbl").textContent = this.t("copy")), 1500);
        } catch {
          /* no clipboard here */
        }
      } }, icon("copy"), h("span", { class: "lbl" }, this.t("copy")));
      acts.append(copy);
    }
    // fork: a saved reply that marks a point in the session (the newest one always does)
    if (index !== undefined && this.agent?.fork && !this.isBusy() && (m.point || last) && !m.error) {
      acts.append(h("button", { type: "button", class: "ib link", title: this.t("forkHint"), onclick: () => this.fork(index) }, icon("fork"), h("span", { class: "lbl" }, this.t("fork"))));
    }
    if (acts.childNodes.length) node.append(acts);
    return node;
  }

  renderBlocks(blocks, live) {
    const out = [];
    let run = [];
    const flush = (atEnd) => {
      if (!run.length) return;
      // a finished run of steps folds into one line; the one still going stays open
      const settled = run.every((b) => b.status !== "running");
      if (run.length > 1 && settled && !(live && atEnd)) {
        const key = `g:${run[0].id}`;
        const g = h("details", { class: "group", open: this.openSteps.has(key) }, h("summary", {}, icon("chevronRight"), h("span", {}, this.summarize(run))), h("div", { class: "steps" }, run.map((b) => this.renderStep(b))));
        g.addEventListener("toggle", () => (g.open ? this.openSteps.add(key) : this.openSteps.delete(key)));
        out.push(g);
      } else out.push(h("div", { class: "steps" }, run.map((b) => this.renderStep(b))));
      run = [];
    };
    for (const b of blocks) {
      if (b.type === "tool") {
        run.push(b);
        continue;
      }
      flush(false);
      if (b.type === "text") out.push(h("div", { class: "md", html: md(b.text) }));
      else if (b.type === "thinking") out.push(h("details", { class: "think" }, h("summary", {}, icon("chevronRight"), this.t("thinking")), h("div", { class: "md" }, b.text)));
      else if (b.type === "ask") out.push(this.renderAsk(b));
      else if (b.type === "note") out.push(h("div", { class: "note" }, b.text));
    }
    flush(true);
    return out;
  }

  /** "Read 2 files, ran 3 commands" */
  summarize(steps) {
    const kind = (n) => (["Read", "NotebookRead"].includes(n) ? "read" : ["Edit", "MultiEdit", "Write", "NotebookEdit"].includes(n) ? "edit"
      : ["Bash", "PowerShell"].includes(n) ? "run" : ["Grep", "Glob", "WebSearch"].includes(n) ? "search" : "other");
    const count = {};
    for (const s of steps) count[kind(s.name)] = (count[kind(s.name)] ?? 0) + 1;
    const text = ["read", "edit", "run", "search", "other"].filter((k) => count[k]).map((k) => this.tn(`sum.${k}`, count[k])).join(this.lang === "zh" ? "，" : ", ");
    return text[0].toUpperCase() + text.slice(1);
  }

  toolName(name) {
    const bare = String(name || "").replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");
    return STRINGS[this.lang]?.[`tool.${bare}`] ?? STRINGS.en[`tool.${bare}`] ?? bare;
  }

  renderStep(b) {
    const el = h(
      "details",
      { class: `step ${b.status}`, open: this.openSteps.has(b.id) },
      h("summary", {}, h("span", { class: "name" }, this.toolName(b.name)), h("span", { class: "hint", title: b.hint }, b.hint)),
      b.result ? h("pre", {}, b.result) : null,
    );
    el.addEventListener("toggle", () => (el.open ? this.openSteps.add(b.id) : this.openSteps.delete(b.id)));
    return el;
  }

  /** an edit as the agent proposes it: removed lines red, added lines green */
  diffEl(input) {
    const lines = [];
    const file = input.file_path || input.path || "";
    if (typeof input.old_string === "string" || typeof input.new_string === "string") {
      for (const l of String(input.old_string ?? "").split("\n")) if (input.old_string) lines.push(["del", "- " + l]);
      for (const l of String(input.new_string ?? "").split("\n")) lines.push(["add", "+ " + l]);
    } else if (Array.isArray(input.edits)) {
      for (const e of input.edits) {
        for (const l of String(e.old_string ?? "").split("\n")) lines.push(["del", "- " + l]);
        for (const l of String(e.new_string ?? "").split("\n")) lines.push(["add", "+ " + l]);
      }
    } else if (typeof input.content === "string") {
      for (const l of input.content.split("\n").slice(0, 80)) lines.push(["add", "+ " + l]);
    } else if (typeof input.diff === "string" && input.diff) {
      for (const l of input.diff.split("\n").slice(0, 200)) lines.push([l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "", l]);
    } else return null;
    return h("div", { class: "diff" }, file ? h("div", { class: "file" }, file) : null, lines.slice(0, 200).map(([c, l]) => h("div", { class: `l ${c}` }, l)));
  }

  renderAsk(b) {
    const agent = this.agentName;
    const settledText = { allowed: "allowed", denied: "denied", cancelled: "cancelled", answered: "answered", approved: "approved", revise: "revise" }[b.status];
    if (b.status !== "pending") {
      const what = b.kind === "permission" ? `${this.toolName(b.tool)}${b.hint ? ": " + b.hint : ""}` : b.kind === "plan" ? this.t("planTitle", { agent }) : b.input?.questions?.[0]?.question || "";
      return h("div", { class: "ask settled" }, `${this.t(settledText)}: ${what}`);
    }
    const reply = (decision) => this.api("POST", `/chats/${this.state.chatId}/answer`, { requestId: b.id, decision }).catch((e) => this.fail(e));

    if (b.kind === "plan") {
      const feedback = h("input", { class: "say", placeholder: this.t("planHint"), onkeydown: (e) => {
        if (e.key === "Enter") reply({ approve: false, feedback: feedback.value });
      } });
      return h("div", { class: "ask", role: "group" },
        h("div", { class: "title" }, this.t("planTitle", { agent })),
        h("div", { class: "md", html: md(b.input?.plan || "") }),
        h("div", { class: "row" },
          h("button", { class: "primary", onclick: () => reply({ approve: true, mode: "acceptEdits" }) }, this.t("approveEdits")),
          h("button", { onclick: () => reply({ approve: true, mode: "default" }) }, this.t("approveAsk")),
          h("button", { onclick: () => reply({ approve: false, feedback: feedback.value }) }, this.t("keepPlanning"))),
        feedback);
    }

    if (b.kind === "question") {
      const questions = Array.isArray(b.input?.questions) ? b.input.questions : [];
      const answers = {};
      const submit = h("button", { class: "primary", disabled: true, onclick: () => reply({ answers }) }, this.t("submit"));
      const ready = () => (submit.disabled = Object.keys(answers).length < questions.length);
      const qs = questions.map((q) => {
        const picked = new Set();
        let typed = "";
        const sync = () => {
          const all = [...picked, ...(typed ? [typed] : [])];
          if (all.length) answers[q.question] = all.join(", ");
          else delete answers[q.question];
          ready();
        };
        const opts = (q.options || []).map((o) =>
          h("button", {
            class: "opt",
            "aria-pressed": "false",
            onclick: (e) => {
              const btn = e.currentTarget;
              if (!q.multiSelect) {
                picked.clear();
                typed = "";
                other.value = "";
                btn.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
              }
              picked.has(o.label) ? picked.delete(o.label) : picked.add(o.label);
              btn.setAttribute("aria-pressed", String(picked.has(o.label)));
              sync();
            },
          }, o.label, o.description ? h("small", {}, o.description) : null),
        );
        // the agent's options are suggestions: the user can always say something else
        const other = h("input", { class: "say", placeholder: this.t("other"), oninput: () => {
          typed = other.value.trim();
          if (!q.multiSelect && typed) {
            picked.clear();
            opts.forEach((x) => x.setAttribute("aria-pressed", "false"));
          }
          sync();
        } });
        return h("div", { class: "q" }, h("div", { class: "title" }, q.question), h("div", { class: "row" }, opts), other);
      });
      return h("div", { class: "ask", role: "group" }, ...qs, h("div", { class: "row" }, submit, h("button", { onclick: () => reply({ skip: true }) }, this.t("skip"))));
    }

    const input = b.input || {};
    const diff = ["Edit", "MultiEdit", "Write"].includes(b.tool) || input.diff ? this.diffEl(input) : null;
    const what = input.command || input.url || (diff ? "" : input.file_path || b.hint || JSON.stringify(input, null, 1));
    const always = (b.suggestions || []).length ? h("button", { onclick: () => reply({ allow: true, suggestion: 0 }) }, this.t("always")) : null;
    const tool = this.toolName(b.tool);
    const action = STRINGS[this.lang]?.[`action.${b.tool}`] ?? STRINGS.en[`action.${b.tool}`] ?? this.t("action.", { tool });
    const instead = h("input", { class: "say", placeholder: this.t("denyHint"), onkeydown: (e) => {
      if (e.key === "Enter" && instead.value.trim()) reply({ allow: false, message: instead.value.trim() });
    } });
    return h("div", { class: "ask", role: "group" },
      h("div", { class: "title" }, this.t("wantsTo", { agent, action })),
      b.desc && b.desc !== String(what) && b.desc !== b.hint ? h("div", { class: "meta" }, b.desc) : null,
      diff,
      what ? h("div", { class: "what" }, String(what)) : null,
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => reply({ allow: true }) }, this.t("allow")),
        always,
        h("button", { onclick: () => reply({ allow: false, message: instead.value.trim() || undefined }) }, this.t("deny"))),
      instead);
  }

  renderBar() {
    const { chatId, meta } = this.state;
    const state = chatId ? this.chatState(chatId) : "";
    const title = meta?.title || this.t("newChat");
    if (this.bar.querySelector(".title-input")) return; // renaming: leave the field alone
    this.chatBtn = h("button", { type: "button", class: "ib chat-btn", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": this.t("chats"),
      title: state === "waiting" ? this.t("waiting", { agent: this.agentName }) : title,
      onclick: (e) => this.openChatMenu(e.currentTarget) },
    h("span", { class: `dot ${state}` }), h("span", { class: "lbl" }, title), icon("chevron"));
    this.chatBtn.addEventListener("dblclick", () => this.state.meta && !this.isFresh() && this.startRename());
    this.bar.replaceChildren(
      this.chatBtn,
      h("button", { type: "button", class: "ib new", "aria-label": this.t("newChat"), title: this.t("newChat"), onclick: () => this.newChat().catch((e) => this.fail(e)) }, icon("plus")),
    );
  }

  buildComposer() {
    this.input = h("textarea", {
      rows: 1,
      oninput: () => {
        this.autosize();
        this.updateSlash();
      },
      onkeydown: (e) => this.composerKeys(e),
    });
    this.input.addEventListener("paste", (e) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        this.attach(files);
      }
    });
    this.button = h("button", { type: "button", class: "send", onclick: () => (this.isBusy() && !this.input.value.trim() ? this.stop() : this.submit()) });
    const picker = h("input", { type: "file", multiple: true, hidden: true, onchange: (e) => {
      this.attach([...e.target.files]);
      e.target.value = "";
    } });
    this.tasksNode = h("div", { class: "tasks" });
    this.seesNode = h("div", { class: "sees", hidden: true });
    this.chipsNode = h("div", { class: "chips" });
    this.toolsNode = h("div", { class: "tools" });
    this.attachBtn = h("button", { type: "button", class: "ib attach", "aria-label": this.t("attachFiles"), title: this.t("attachFiles"), onclick: () => picker.click() }, icon("clip"));
    this.boxNode = h("div", { class: "box" }, this.chipsNode, this.input, this.toolsNode, picker);
    const composer = h("div", { class: "composer" }, this.tasksNode, this.seesNode, this.boxNode);
    // drop files anywhere on the sidebar
    this.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    });
    this.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      this.attach([...e.dataTransfer.files]);
    });
    // the desktop apps' shortcuts, while focus is anywhere in the sidebar
    this.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      const btn = (c) => this.toolsNode.querySelector(c);
      if (k === "m" && btn(".mode-btn")) this.openModeMenu(btn(".mode-btn"));
      else if (k === "i" && btn(".model-btn")) this.openModelMenu(btn(".model-btn"));
      else if (k === "e" && btn(".model-btn")) this.openModelMenu(btn(".model-btn"), true);
      else return;
      e.preventDefault();
    });
    return composer;
  }

  composerKeys(e) {
    if (this.slash) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        return this.moveSlash(e.key === "ArrowDown" ? 1 : -1);
      }
      if ((e.key === "Enter" && !e.shiftKey && !e.isComposing) || e.key === "Tab") {
        e.preventDefault();
        return this.applySlash();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        return this.closePop();
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.submit();
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      this.cycleMode();
    } else if (e.key === "Escape" && this.isBusy()) {
      e.preventDefault();
      this.stop();
    }
  }

  /** what sits around the message box: the task list, what the agent sees, attachments, the controls */
  renderExtras() {
    if (!this.tasksNode) return;
    const tasks = this.state.meta?.tasks ?? [];
    if (tasks.length) {
      const done = tasks.filter((t) => t.status === "completed").length;
      const open = this.tasksOpen ?? true;
      this.tasksNode.replaceChildren(h("details", { open, ontoggle: (e) => (this.tasksOpen = e.currentTarget.open) },
        h("summary", {}, this.t("tasks", { done, total: tasks.length })),
        h("ul", {}, tasks.map((t) => h("li", { class: t.status }, t.subject)))));
    } else this.tasksNode.replaceChildren();

    this.seesNode.hidden = !this.state.screenLabel;
    this.seesNode.textContent = this.state.screenLabel ? `${this.t("sees", { agent: this.agentName })}: ${this.state.screenLabel}` : "";

    this.chipsNode.replaceChildren(...this.state.pending.map((f, i) =>
      h("span", { class: "chip" }, f.name, h("button", { class: "x", "aria-label": this.t("remove", { name: f.name }), onclick: () => {
        this.state.pending.splice(i, 1);
        this.renderExtras();
      } }, "×"))));

    const meta = this.state.meta;
    // however the chat came to be open (loaded, New chat, a pick, a fork), its agent's options get fetched
    if (this.state.app && this.agentId && !this.info.has(this.agentId)) this.loadInfo(this.agentId);
    const keep = this.pop && this.toolsNode.contains(this.pop.anchor) ? this.pop.anchor.className : null;
    const kids = [this.attachBtn];
    if (this.state.app && this.modes().length) {
      const mode = meta?.mode;
      kids.push(h("button", { type: "button", class: `ib mode-btn${RISKY.has(mode) ? " risky" : ""}`, "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": this.t("mode"),
        title: `${this.t("mode")} (${this.t("modeHint")})`, onclick: (e) => this.openModeMenu(e.currentTarget) },
      icon(MODE_ICON[mode] ?? "hand"), h("span", { class: "lbl" }, mode ? this.modeName(mode) : this.t("asSetUpShort"))));
    }
    kids.push(h("span", { class: "grow" }));
    if (this.state.app && this.agentId) {
      const cur = this.currentModel();
      kids.push(h("button", { type: "button", class: "ib model-btn", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": this.t("model"),
        title: `${this.agentName}: ${cur.name}`, onclick: (e) => this.openModelMenu(e.currentTarget) },
      h("span", { class: "lbl" }, cur.name),
      cur.efforts.length ? h("span", { class: "eff" }, this.effortLabel(meta?.effort, true)) : null,
      icon("chevron")));
      const { p, known } = this.contextUse();
      const r = 6;
      const len = 2 * Math.PI * r;
      // no arc at all below 1%: a round cap on an empty arc draws a dot, which reads as a spinner
      const arc = p >= 0.01 ? `<circle cx="8" cy="8" r="${r}" class="fg" stroke-dasharray="${(len * p).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 8 8)"/>` : "";
      const ring = h("button", { type: "button", class: `ib ring${known ? " known" : ""}${p >= 0.9 ? " bad" : p >= 0.7 ? " warn" : ""}`, "aria-haspopup": "dialog", "aria-expanded": "false",
        "aria-label": this.t("ringTip"), title: known ? `${this.t("context")}: ${Math.round(p * 100)}%` : this.t("ringTip"), onclick: (e) => this.openUsage(e.currentTarget),
        html: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="${r}" class="bg"/>${arc}</svg>${known ? `<span class="pct num">${Math.round(p * 100)}%</span>` : ""}` });
      kids.push(ring);
    }
    kids.push(this.button);
    this.toolsNode.replaceChildren(...kids);
    // a menu open on a control that was just redrawn follows the new one
    if (keep && this.pop) {
      const again = this.toolsNode.querySelector("." + keep.split(" ").filter((c) => c !== "ib")[0]);
      if (again) {
        this.pop.anchor = again;
        again.setAttribute("aria-expanded", "true");
        this.place();
      }
    }
    this.updateComposer();
  }

  isBusy() {
    return !!this.state.chatId && this.state.running.has(this.state.chatId);
  }

  updateComposer() {
    if (!this.button) return;
    this.input.placeholder = this.t("placeholder", { agent: this.agentName });
    const stop = this.isBusy() && !this.input.value.trim();
    this.button.replaceChildren(icon(stop ? "stop" : "up"), h("span", { class: "sr" }, stop ? this.t("stop") : this.t("send")));
    this.button.title = stop ? `${this.t("stop")} (Esc)` : this.t("send");
    this.button.className = stop ? "send stop" : "send";
    this.button.disabled = !stop && !this.input.value.trim();
  }

  autosize() {
    this.input.style.height = "auto";
    this.input.style.height = Math.min(this.input.scrollHeight, 200) + "px";
    this.updateComposer();
  }

  async submit() {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = "";
    this.autosize();
    this.closePop();
    if (this.runLocal(text)) return;
    await this.post(text).catch(() => {});
  }

  async stop() {
    if (this.state.chatId) await this.api("POST", `/chats/${this.state.chatId}/cancel`, {}).catch(() => {});
  }

  scrollDown(force) {
    const el = this.log;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (force || near) el.scrollTop = el.scrollHeight;
  }
}

if (!customElements.get("skillframe-chat")) customElements.define("skillframe-chat", SkillframeChat);
export { SkillframeChat };
