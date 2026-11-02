// <skillframe-chat endpoint="/sf" lang="en|zh">: the agent sidebar, as a Web Component.
//
// It lives inside someone else's app, so it borrows the host page's font and background and
// keeps everything quiet except one thing: a card where the agent is waiting for the user.
// Its styles sit in a shadow root, so no class name here can collide with the host's.
//
// Page API:
//   chat.setScreen(obj)                 what the user is looking at; sent with every message
//   await chat.ask({ prompt, shown })   start a turn from your own button; resolves { ok, error }
//   chat.newChat()
//   events: "chat-done" ({ ok, error }), and "sf:<name>" for every sf.publish(name, data)

const STRINGS = {
  en: {
    newChat: "New chat",
    placeholder: "Message {agent}…",
    send: "Send",
    stop: "Stop",
    empty: "Ask {agent} to do something in {app}.",
    thinking: "Thinking",
    working: "{agent} is working…",
    waiting: "{agent} is waiting for you",
    wantsTo: "{agent} wants to use {tool}",
    allow: "Allow",
    always: "Always allow",
    deny: "Deny",
    allowed: "Allowed",
    denied: "Denied",
    cancelled: "No longer waiting",
    answered: "Answered",
    skip: "Skip",
    submit: "Send answers",
    planTitle: "{agent} proposes a plan",
    approve: "Approve and start",
    keepPlanning: "Keep planning",
    approved: "Plan approved",
    revise: "Asked to keep planning",
    stopped: "Stopped",
    notInstalled: "{agent} isn't installed on this computer. Install it with `{install}`, then sign in: {login}",
    queued: "Queued, sent when the current reply ends",
    chats: "Chats",
    agent: "Agent",
    notInstalledShort: "{agent} (not installed)",
    signedOut: "{agent} doesn't look signed in on this computer. {login}",
    keepsAgent: "This chat stays with {agent}. Starting a new chat with {other}.",
    attach: "Attach",
    attachFiles: "Attach files",
    remove: "Remove {name}",
    mode: "Permission mode",
    model: "Model",
    asSetUp: "As set up",
    defaultModel: "Default model",
    tasks: "Tasks: {done} of {total} done",
    fork: "Fork from here",
    forkHint: "Start a new chat that goes on from this reply",
    tooBig: "{name} is larger than 15 MB; attach a smaller file.",
  },
  zh: {
    newChat: "新对话",
    placeholder: "给 {agent} 发消息…",
    send: "发送",
    stop: "停止",
    empty: "让 {agent} 在 {app} 里帮你做点什么。",
    thinking: "思考过程",
    working: "{agent} 正在处理…",
    waiting: "{agent} 在等你回应",
    wantsTo: "{agent} 想使用 {tool}",
    allow: "允许",
    always: "始终允许",
    deny: "拒绝",
    allowed: "已允许",
    denied: "已拒绝",
    cancelled: "已不再等待",
    answered: "已回答",
    skip: "跳过",
    submit: "提交回答",
    planTitle: "{agent} 提出了一个计划",
    approve: "批准并开始",
    keepPlanning: "继续完善计划",
    approved: "计划已批准",
    revise: "已要求继续完善",
    stopped: "已停止",
    notInstalled: "这台电脑没有安装 {agent}。先运行 `{install}` 安装，再登录：{login}",
    queued: "已排队，当前回复结束后发送",
    chats: "对话",
    agent: "Agent",
    notInstalledShort: "{agent}（未安装）",
    signedOut: "这台电脑上的 {agent} 看起来还没登录。{login}",
    keepsAgent: "这个对话会一直用 {agent}，已用 {other} 新开一个对话。",
    attach: "附件",
    attachFiles: "添加附件",
    remove: "移除 {name}",
    mode: "权限模式",
    model: "模型",
    asSetUp: "按本机设置",
    defaultModel: "默认模型",
    tasks: "任务：已完成 {done} / {total}",
    fork: "从这里分叉",
    forkHint: "新开一个对话，从这条回复接着往下",
    tooBig: "{name} 超过 15 MB，请换一个小一点的文件。",
    // the built-in agents' text, which the server sends in English (see local())
    "login.claude": "打开终端，运行 `claude`，输入 `/login`，然后在浏览器里完成登录。",
    "login.codex": "打开终端，运行 `codex login`（用 ChatGPT 账号或 API key 登录）。",
    "login.qwen": "打开终端，运行 `qwen`，选择登录方式（`/auth`）。",
    "mode.claude.default": "编辑前先问",
    "mode.claude.acceptEdits": "直接编辑",
    "mode.claude.plan": "先出计划",
    "modeDesc.claude.default": "编辑文件或运行命令前先征求同意",
    "modeDesc.claude.acceptEdits": "直接编辑文件；有风险的命令仍会先问",
    "modeDesc.claude.plan": "只读；先提出计划，你批准后再动手",
    "mode.codex.default": "编辑前先问",
    "mode.codex.acceptEdits": "直接编辑",
    "mode.codex.plan": "只读",
    "modeDesc.codex.default": "运行它不确定是否安全的操作前先问",
    "modeDesc.codex.acceptEdits": "在工作文件夹里直接干活；需要更多权限时再问",
    "modeDesc.codex.plan": "只能查看，不能改动任何东西",
  },
};

const CSS = `
:host {
  --sf-ink: #1C1F24; --sf-muted: #69707A; --sf-line: #E3E6EA; --sf-soft: #F3F5F7;
  --sf-accent: #2F5FD0; --sf-attention: #B26A00; --sf-attention-soft: #FFF6E8; --sf-danger: #B42318;
  --sf-bg: transparent;
  display: flex; flex-direction: column; min-height: 0; min-width: 0; height: 100%;
  font: inherit; font-size: 13px; line-height: 1.5; color: var(--sf-ink); background: var(--sf-bg);
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"])) {
    --sf-ink: #E6E8EB; --sf-muted: #9AA1AA; --sf-line: #2C3036; --sf-soft: #202328;
    --sf-accent: #7FA2FF; --sf-attention: #E0A43A; --sf-attention-soft: #2A2216; --sf-danger: #F97066;
  }
}
:host([theme="dark"]) {
  --sf-ink: #E6E8EB; --sf-muted: #9AA1AA; --sf-line: #2C3036; --sf-soft: #202328;
  --sf-accent: #7FA2FF; --sf-attention: #E0A43A; --sf-attention-soft: #2A2216; --sf-danger: #F97066;
}
* { box-sizing: border-box; }
button, textarea, select { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--sf-accent); outline-offset: 1px; }

.bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--sf-line); min-width: 0; }
.bar select { flex: 1; min-width: 0; border: 1px solid transparent; background: transparent; border-radius: 4px; padding: 3px 4px; text-overflow: ellipsis; }
.bar select:hover { border-color: var(--sf-line); }
.bar .agent { color: var(--sf-muted); white-space: nowrap; display: flex; align-items: center; gap: 6px; }
.bar .pick { flex: none; color: var(--sf-muted); max-width: 140px; }
.bar .pick:hover { color: var(--sf-ink); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sf-muted); flex: none; }
.dot.busy { background: var(--sf-accent); animation: sf-pulse 1.4s ease-in-out infinite; }
.dot.waiting { background: var(--sf-attention); }
@keyframes sf-pulse { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .dot.busy { animation: none; } }
.ghost { border: 1px solid var(--sf-line); background: transparent; border-radius: 4px; padding: 3px 8px; white-space: nowrap; }
.ghost:hover { background: var(--sf-soft); }

.log { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
.empty { margin: auto 0; color: var(--sf-muted); text-align: center; padding: 24px 8px; }
.user { border-left: 2px solid var(--sf-accent); padding: 2px 0 2px 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
.reply { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.md { overflow-wrap: anywhere; min-width: 0; }
.md > :first-child { margin-top: 0; } .md > :last-child { margin-bottom: 0; }
.md p, .md ul, .md ol, .md pre { margin: 0 0 8px; }
.md ul, .md ol { padding-left: 20px; }
.md code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; background: var(--sf-soft); padding: 1px 4px; border-radius: 3px; }
.md pre { background: var(--sf-soft); padding: 8px 10px; border-radius: 4px; overflow-x: auto; }
.md pre code { background: none; padding: 0; }
.md a { color: var(--sf-accent); }
details.think { color: var(--sf-muted); }
details.think summary { cursor: pointer; width: fit-content; }
details.think .md { padding: 4px 0 0 12px; border-left: 1px solid var(--sf-line); margin-top: 4px; white-space: pre-wrap; }

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
.step pre { margin: 4px 0 2px; font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; background: var(--sf-soft); padding: 6px 8px; border-radius: 4px; max-height: 220px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }

.ask { border: 1px solid var(--sf-line); border-left: 3px solid var(--sf-attention); border-radius: 6px; padding: 10px 12px; background: var(--sf-attention-soft); display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ask.settled { background: transparent; border-left-color: var(--sf-line); color: var(--sf-muted); padding: 6px 12px; }
.ask .title { font-weight: 600; }
.ask .what { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; background: var(--sf-soft); padding: 4px 6px; border-radius: 3px; max-height: 160px; overflow: auto; white-space: pre-wrap; }
.ask .row { display: flex; flex-wrap: wrap; gap: 6px; }
.ask button { border: 1px solid var(--sf-line); background: var(--sf-bg, transparent); border-radius: 4px; padding: 4px 10px; }
.ask button.primary { background: var(--sf-ink); color: var(--sf-soft); border-color: var(--sf-ink); }
.ask button[aria-pressed="true"] { border-color: var(--sf-accent); box-shadow: inset 0 0 0 1px var(--sf-accent); }
.ask .q { display: flex; flex-direction: column; gap: 6px; }
.ask .opt { text-align: left; display: flex; flex-direction: column; }
.ask .opt small { color: var(--sf-muted); }
.note, .meta { color: var(--sf-muted); font-size: 12px; }
.error { color: var(--sf-danger); overflow-wrap: anywhere; }

.composer { border-top: 1px solid var(--sf-line); padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.box { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--sf-line); border-radius: 6px; padding: 6px 6px 6px 10px; min-width: 0; }
.box:focus-within { border-color: var(--sf-accent); }
.box textarea { min-width: 0; border: 0; outline: 0; resize: none; background: transparent; max-height: 180px; padding: 3px 0; }
.tools { display: flex; align-items: center; gap: 6px; min-width: 0; }
.pickers { flex: 1; display: flex; gap: 4px; min-width: 0; }
.pickers select { min-width: 0; max-width: 50%; border: 1px solid transparent; background: transparent; color: var(--sf-muted); border-radius: 4px; padding: 2px 2px; font-size: 12px; text-overflow: ellipsis; }
.pickers select:hover { border-color: var(--sf-line); color: var(--sf-ink); }
button.link { border: 0; background: none; padding: 2px 4px; color: var(--sf-muted); font-size: 12px; border-radius: 4px; flex: none; }
button.link:hover { color: var(--sf-ink); background: var(--sf-soft); }
.send { flex: none; border: 0; border-radius: 4px; padding: 4px 12px; background: var(--sf-accent); color: #fff; margin-left: auto; }
.send.stop { background: var(--sf-ink); color: var(--sf-soft); }
.send:disabled { opacity: .4; cursor: default; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.chips:empty { display: none; }
.chip { display: inline-flex; align-items: center; gap: 2px; max-width: 100%; font-size: 12px; background: var(--sf-soft); border-radius: 4px; padding: 1px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip .x { border: 0; background: none; padding: 0 2px; color: var(--sf-muted); line-height: 1; }
.user .chips { margin-top: 4px; }
.tasks:empty { display: none; }
.tasks summary { cursor: pointer; color: var(--sf-muted); font-size: 12px; }
.tasks ul { margin: 4px 0 0; padding: 0 0 0 18px; max-height: 120px; overflow: auto; }
.tasks li { overflow-wrap: anywhere; }
.tasks li.completed { color: var(--sf-muted); text-decoration: line-through; }
.tasks li.in_progress { font-weight: 600; }
.acts { display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
.reply:hover .acts, .acts:focus-within { opacity: 1; }
@media (hover: none) { .acts { opacity: 1; } }
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

/** Just enough markdown for agent replies, built on escaped text (nothing raw reaches innerHTML). */
export function md(src) {
  const blocks = String(src ?? "").split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g);
  let out = "";
  for (const part of blocks) {
    const fence = part.match(/^```[^\n]*\n([\s\S]*?)(?:```)?$/);
    if (fence) {
      out += `<pre><code>${esc(fence[1].replace(/\n$/, ""))}</code></pre>`;
      continue;
    }
    for (const para of part.split(/\n{2,}/)) {
      if (!para.trim()) continue;
      const lines = para.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) out += "<ul>" + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("") + "</ul>";
      else if (lines.every((l) => /^\s*\d+[.)] /.test(l))) out += "<ol>" + lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)] /, ""))}</li>`).join("") + "</ol>";
      else out += `<p>${lines.map(inline).join("<br>")}</p>`;
    }
  }
  return out;
}

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
    this.state = { app: null, chats: [], running: new Set(), chatId: null, messages: [], live: null, error: "", screen: null, pending: [] };
    this.options = new Map(); // agent id -> { modes, models } for the pickers
    this.openSteps = new Set(); // tool steps the user opened: they stay open when the reply redraws
    this.waiters = new Map(); // chatId -> resolve() for ask()
    this.ops = Promise.resolve(); // chat switches run one after another (see serial)
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

  t(key, vars = {}) {
    const lang = (this.getAttribute("lang") || navigator.language || "en").slice(0, 2);
    const s = (STRINGS[lang] || STRINGS.en)[key] ?? STRINGS.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }

  /** text the server sent (in English), in the page's language when this file has it */
  local(key, text) {
    const lang = (this.getAttribute("lang") || navigator.language || "en").slice(0, 2);
    return STRINGS[lang]?.[key] ?? text;
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
    if (this.isFresh()) {
      this.state.meta = await this.api("POST", `/chats/${meta.id}/agent`, { agent: id });
      await this.refreshChats();
      this.render();
    } else {
      const from = this.agentName;
      const chat = await this.api("POST", "/chats", { agent: id });
      Object.assign(this.state, { chatId: chat.id, meta: chat, messages: [], live: null, error: "" });
      await this.refreshChats();
      this.state.notice = this.t("keepsAgent", { agent: from, other: this.agentName });
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
  }

  // ---- page API ---------------------------------------------------------------
  setScreen(screen) {
    this.state.screen = screen;
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
        this.state.live = { blocks: [], queue: [] };
      }
      this.render();
    });
    on("chat.next", mine((d) => {
      this.state.messages.push(d.message);
      this.state.live = { blocks: [], queue: d.queue };
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
    on("chat.ask", mine((d) => upsert(d.ask)));
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
    on("chat.meta", mine((d) => {
      this.state.meta = d.meta;
      this.renderExtras();
    }));
    on("agent.info", (d) => {
      this.options.set(d.agent, { modes: d.modes, models: d.models });
      this.renderExtras();
    });
    // a shared file changed (the agent edited it, or the app wrote it): the page redraws
    on("file.changed", (d) => this.dispatchEvent(new CustomEvent("file-changed", { detail: d })));
    // sf.publish(name, data) on the server: handed to the page as an "sf:<name>" event on this element
    on("sf", (d) => this.dispatchEvent(new CustomEvent(`sf:${d.name}`, { detail: d.data })));
  }

  ensureLive() {
    if (!this.state.live) this.state.live = { blocks: [], queue: [] };
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
    this.state.meta = r.meta;
    this.state.messages = r.messages;
    if (!quiet) this.state.notice = "";
    this.state.live = r.live;
    if (!quiet) this.state.error = "";
    this.render();
  }

  /** the agent's modes and models, once per agent (ACP agents report theirs in their first chat) */
  async loadOptions(agentId) {
    if (!agentId || this.options.has(agentId)) return;
    this.options.set(agentId, { modes: [], models: [] });
    try {
      this.options.set(agentId, await this.api("GET", `/agents/${agentId}/options`));
    } catch {
      this.options.delete(agentId);
    }
    this.renderExtras();
  }

  async changeSetting(change) {
    try {
      this.state.meta = await this.api("POST", `/chats/${this.state.chatId}/settings`, change);
    } catch (e) {
      this.state.error = e.message;
      this.render();
    }
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
      this.log.append(h("div", { class: "empty", html: md(hint) }));
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
      this.liveNode.append(...this.renderBlocks(live.blocks));
      if (!live.blocks.length) this.liveNode.append(h("div", { class: "note" }, this.t("working", { agent: this.agentName })));
      for (const q of live.queue || []) this.liveNode.append(h("div", { class: "user" }, q.msg.text), h("div", { class: "note" }, this.t("queued")));
    }
    this.renderBar();
    this.updateComposer();
    if (!skipScroll) this.scrollDown();
  }

  renderUser(m) {
    const files = (m.files || []).map((f) => h("span", { class: "chip", title: f.name }, f.name));
    return h("div", { class: "user" }, m.text, files.length ? h("div", { class: "chips" }, files) : null);
  }

  renderReply(m, index, last) {
    const node = h("div", { class: "reply" }, ...this.renderBlocks(m.blocks || []));
    if (m.cancelled) node.append(h("div", { class: "note" }, this.t("stopped")));
    if (m.error) node.append(h("div", { class: "error", html: md(m.error) }));
    // an agent that isn't signed in says so in its own words: add how to sign in to it
    if (m.error && /auth|log ?in|sign ?in|credential|api key/i.test(m.error) && this.agent?.login) node.append(h("div", { class: "note", html: md(this.local(`login.${this.agent.id}`, this.agent.login)) }));
    // fork: a saved reply that marks a point in the session (the newest one always does)
    if (index !== undefined && this.agent?.fork && !this.isBusy() && (m.point || last) && !m.error) {
      node.append(h("div", { class: "acts" }, h("button", { class: "link", title: this.t("forkHint"), onclick: () => this.fork(index) }, this.t("fork"))));
    }
    return node;
  }

  renderBlocks(blocks) {
    const out = [];
    let steps = null;
    for (const b of blocks) {
      if (b.type === "tool") {
        if (!steps) out.push((steps = h("div", { class: "steps" })));
        steps.append(this.renderStep(b));
        continue;
      }
      steps = null;
      if (b.type === "text") out.push(h("div", { class: "md", html: md(b.text) }));
      else if (b.type === "thinking") out.push(h("details", { class: "think" }, h("summary", {}, this.t("thinking")), h("div", { class: "md" }, b.text)));
      else if (b.type === "ask") out.push(this.renderAsk(b));
      else if (b.type === "note") out.push(h("div", { class: "note" }, b.text));
    }
    return out;
  }

  renderStep(b) {
    const name = String(b.name || "").replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");
    const el = h(
      "details",
      { class: `step ${b.status}`, open: this.openSteps.has(b.id) },
      h("summary", {}, h("span", { class: "name" }, name), h("span", { class: "hint", title: b.hint }, b.hint)),
      b.result ? h("pre", {}, b.result) : null,
    );
    el.addEventListener("toggle", () => (el.open ? this.openSteps.add(b.id) : this.openSteps.delete(b.id)));
    return el;
  }

  renderAsk(b) {
    const agent = this.agentName;
    const settledText = { allowed: "allowed", denied: "denied", cancelled: "cancelled", answered: "answered", approved: "approved", revise: "revise" }[b.status];
    if (b.status !== "pending") {
      const what = b.kind === "permission" ? `${b.tool}${b.hint ? ": " + b.hint : ""}` : b.kind === "plan" ? this.t("planTitle", { agent }) : b.input?.questions?.[0]?.question || "";
      return h("div", { class: "ask settled" }, `${this.t(settledText)} · ${what}`);
    }
    const reply = (decision) => this.api("POST", `/chats/${this.state.chatId}/answer`, { requestId: b.id, decision }).catch((e) => {
      this.state.error = e.message;
      this.render();
    });

    if (b.kind === "plan") {
      return h(
        "div",
        { class: "ask", role: "group" },
        h("div", { class: "title" }, this.t("planTitle", { agent })),
        h("div", { class: "md", html: md(b.input?.plan || "") }),
        h("div", { class: "row" },
          h("button", { class: "primary", onclick: () => reply({ approve: true, mode: "acceptEdits" }) }, this.t("approve")),
          h("button", { onclick: () => reply({ approve: false }) }, this.t("keepPlanning"))),
      );
    }

    if (b.kind === "question") {
      const questions = Array.isArray(b.input?.questions) ? b.input.questions : [];
      const answers = {};
      const submit = h("button", { class: "primary", disabled: true, onclick: () => reply({ answers }) }, this.t("submit"));
      const qs = questions.map((q) => {
        const picked = new Set();
        const opts = (q.options || []).map((o) =>
          h("button", {
            class: "opt",
            "aria-pressed": "false",
            onclick: (e) => {
              const btn = e.currentTarget;
              if (!q.multiSelect) {
                picked.clear();
                btn.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false"));
              }
              picked.has(o.label) ? picked.delete(o.label) : picked.add(o.label);
              btn.setAttribute("aria-pressed", String(picked.has(o.label)));
              if (picked.size) answers[q.question] = [...picked].join(", ");
              else delete answers[q.question];
              submit.disabled = Object.keys(answers).length < questions.length;
            },
          }, o.label, o.description ? h("small", {}, o.description) : null),
        );
        return h("div", { class: "q" }, h("div", { class: "title" }, q.question), h("div", { class: "row" }, opts));
      });
      return h("div", { class: "ask", role: "group" }, ...qs, h("div", { class: "row" }, submit, h("button", { onclick: () => reply({ skip: true }) }, this.t("skip"))));
    }

    const what = b.input?.command || b.input?.file_path || b.hint || JSON.stringify(b.input, null, 1);
    const always = (b.suggestions || []).length ? h("button", { onclick: () => reply({ allow: true, suggestion: 0 }) }, this.t("always")) : null;
    const tool = String(b.tool).replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");
    return h(
      "div",
      { class: "ask", role: "group" },
      h("div", { class: "title" }, this.t("wantsTo", { agent, tool })),
      b.desc && b.desc !== String(what) && b.desc !== b.hint ? h("div", { class: "meta" }, b.desc) : null,
      what ? h("div", { class: "what" }, String(what)) : null,
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => reply({ allow: true }) }, this.t("allow")),
        always,
        h("button", { onclick: () => reply({ allow: false }) }, this.t("deny"))),
    );
  }

  renderBar() {
    const { chats, chatId, running, live } = this.state;
    const waiting = live?.blocks?.some((b) => b.type === "ask" && b.status === "pending");
    const busy = chatId && running.has(chatId);
    const select = h(
      "select",
      { "aria-label": this.t("chats"), onchange: (e) => this.open(e.target.value) },
      chats.length ? chats.map((c) => h("option", { value: c.id, selected: c.id === chatId }, c.title || this.t("newChat"))) : h("option", {}, this.t("newChat")),
    );
    const status = waiting ? this.t("waiting", { agent: this.agentName }) : busy ? this.t("working", { agent: this.agentName }) : "";
    // replaceChildren() writes a null out as the text "null": leave the agent out until the app is known
    this.bar.replaceChildren(...[
      chats.length ? select : h("span", { style: "flex:1" }),
      this.state.app ? h("span", { class: "agent", title: status }, h("span", { class: `dot ${waiting ? "waiting" : busy ? "busy" : ""}` }), this.agentPicker()) : null,
      h("button", { class: "ghost", onclick: () => this.newChat().catch((e) => { this.state.error = e.message; this.render(); }) }, this.t("newChat")),
    ].filter(Boolean));
  }

  agentPicker() {
    if (this.agents.length < 2) return this.agentName;
    const current = this.agent?.id;
    return h(
      "select",
      { class: "pick", "aria-label": this.t("agent"), onchange: (e) => this.pickAgent(e.target.value).catch((err) => { this.state.error = err.message; this.render(); }) },
      this.agents.map((a) => h("option", { value: a.id, selected: a.id === current, disabled: !a.installed }, a.installed ? a.name : this.t("notInstalledShort", { agent: a.name }))),
    );
  }

  buildComposer() {
    this.input = h("textarea", {
      rows: 1,
      oninput: () => this.autosize(),
      onkeydown: (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          this.submit();
        }
      },
    });
    this.input.addEventListener("paste", (e) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        this.attach(files);
      }
    });
    this.button = h("button", { class: "send", onclick: () => (this.isBusy() && !this.input.value.trim() ? this.stop() : this.submit()) });
    const picker = h("input", { type: "file", multiple: true, hidden: true, onchange: (e) => {
      this.attach([...e.target.files]);
      e.target.value = "";
    } });
    this.tasksNode = h("div", { class: "tasks" });
    this.chipsNode = h("div", { class: "chips" });
    this.pickersNode = h("div", { class: "pickers" });
    const tools = h("div", { class: "tools" },
      h("button", { class: "link", title: this.t("attachFiles"), onclick: () => picker.click() }, this.t("attach")),
      this.pickersNode,
      this.button,
      picker);
    const composer = h("div", { class: "composer" }, this.tasksNode, h("div", { class: "box" }, this.chipsNode, this.input, tools));
    // drop files anywhere on the sidebar
    this.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    });
    this.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      this.attach([...e.dataTransfer.files]);
    });
    return composer;
  }

  /** what sits around the message box: the task list, attachments waiting to go, the pickers */
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

    this.chipsNode.replaceChildren(...this.state.pending.map((f, i) =>
      h("span", { class: "chip" }, f.name, h("button", { class: "x", "aria-label": this.t("remove", { name: f.name }), onclick: () => {
        this.state.pending.splice(i, 1);
        this.renderExtras();
      } }, "×"))));

    const meta = this.state.meta;
    // however the chat came to be open (loaded, New chat, a pick, a fork), its agent's options get fetched
    if (meta && !this.options.has(meta.agent)) this.loadOptions(meta.agent);
    const opts = meta ? this.options.get(meta.agent) : null;
    const pickers = [];
    if (meta && opts?.modes?.length) {
      pickers.push(h("select", { "aria-label": this.t("mode"), title: this.t("mode"), onchange: (e) => this.changeSetting({ mode: e.target.value }) },
        h("option", { value: "", selected: !meta.mode }, this.t("asSetUp")),
        opts.modes.map((m) => h("option", {
          value: m.id, selected: m.id === meta.mode,
          title: m.desc ? this.local(`modeDesc.${meta.agent}.${m.id}`, m.desc) : undefined,
        }, this.local(`mode.${meta.agent}.${m.id}`, m.name)))));
    }
    if (meta && opts?.models?.length) {
      pickers.push(h("select", { "aria-label": this.t("model"), title: this.t("model"), onchange: (e) => this.changeSetting({ model: e.target.value }) },
        h("option", { value: "", selected: !meta.model }, this.t("defaultModel")),
        opts.models.map((m) => h("option", { value: m.id, selected: m.id === meta.model, title: m.desc || undefined }, m.name))));
    }
    this.pickersNode.replaceChildren(...pickers);
    this.updateComposer();
  }

  isBusy() {
    return !!this.state.chatId && this.state.running.has(this.state.chatId);
  }

  updateComposer() {
    if (!this.button) return;
    this.input.placeholder = this.t("placeholder", { agent: this.agentName });
    const stop = this.isBusy() && !this.input.value.trim();
    this.button.textContent = stop ? this.t("stop") : this.t("send");
    this.button.className = stop ? "send stop" : "send";
    this.button.disabled = !stop && !this.input.value.trim();
  }

  autosize() {
    this.input.style.height = "auto";
    this.input.style.height = Math.min(this.input.scrollHeight, 180) + "px";
    this.updateComposer();
  }

  async submit() {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = "";
    this.autosize();
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
