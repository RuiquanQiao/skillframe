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
.box { display: flex; align-items: flex-end; gap: 8px; border: 1px solid var(--sf-line); border-radius: 6px; padding: 6px 6px 6px 10px; }
.box:focus-within { border-color: var(--sf-accent); }
.box textarea { flex: 1; min-width: 0; border: 0; outline: 0; resize: none; background: transparent; max-height: 180px; padding: 3px 0; }
.box button { border: 0; border-radius: 4px; padding: 4px 12px; background: var(--sf-accent); color: #fff; }
.box button.stop { background: var(--sf-ink); color: var(--sf-soft); }
.box button:disabled { opacity: .4; cursor: default; }
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
    this.state = { app: null, chats: [], running: new Set(), chatId: null, messages: [], live: null, error: "", screen: null };
    this.waiters = new Map(); // chatId -> resolve() for ask()
  }

  get endpoint() {
    return (this.getAttribute("endpoint") || "/sf").replace(/\/$/, "");
  }

  t(key, vars = {}) {
    const lang = (this.getAttribute("lang") || navigator.language || "en").slice(0, 2);
    const s = (STRINGS[lang] || STRINGS.en)[key] ?? STRINGS.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }

  get agentName() {
    return this.state.app?.agents?.[0]?.name || "Agent";
  }

  async connectedCallback() {
    this.root.innerHTML = "";
    this.root.append(h("style", {}, CSS));
    this.bar = h("div", { class: "bar" });
    this.log = h("div", { class: "log", role: "log", "aria-live": "polite" });
    this.composer = this.buildComposer();
    this.root.append(this.bar, this.log, this.composer);
    this.listen();
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

  async newChat() {
    const chat = await this.api("POST", "/chats", {});
    await this.refreshChats();
    await this.open(chat.id);
    return chat;
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
    this.state.chatId = chatId;
    this.state.messages = r.messages;
    this.state.live = r.live;
    if (!quiet) this.state.error = "";
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
        echo = { role: "user", text: shown ?? text, at: Date.now() / 1000 };
        this.state.messages.push(echo);
        this.pendingEcho = true;
        this.render();
      }
      await this.api("POST", `/chats/${this.state.chatId}/send`, { text, shown, screen: this.state.screen });
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
    if (!messages.length && !this.state.live) {
      this.log.append(h("div", { class: "empty" }, this.t("empty", { agent: this.agentName, app: this.state.app?.appName || "this app" })));
    }
    for (const m of messages) this.log.append(m.role === "user" ? h("div", { class: "user" }, m.text) : this.renderReply(m));
    this.liveNode = h("div", { class: "reply" });
    this.log.append(this.liveNode);
    this.renderLive(true);
    if (error) this.log.append(h("div", { class: "error", html: md(error) }));
    this.updateComposer();
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

  renderReply(m) {
    const node = h("div", { class: "reply" }, ...this.renderBlocks(m.blocks || []));
    if (m.cancelled) node.append(h("div", { class: "note" }, this.t("stopped")));
    if (m.error) node.append(h("div", { class: "error", html: md(m.error) }));
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
    return h(
      "details",
      { class: `step ${b.status}` },
      h("summary", {}, h("span", { class: "name" }, name), h("span", { class: "hint", title: b.hint }, b.hint)),
      b.result ? h("pre", {}, b.result) : null,
    );
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
    this.bar.replaceChildren(
      chats.length ? select : h("span", { style: "flex:1" }),
      h("span", { class: "agent", title: status }, h("span", { class: `dot ${waiting ? "waiting" : busy ? "busy" : ""}` }), this.agentName),
      h("button", { class: "ghost", onclick: () => this.newChat().catch((e) => { this.state.error = e.message; this.render(); }) }, this.t("newChat")),
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
    this.button = h("button", { onclick: () => (this.isBusy() && !this.input.value.trim() ? this.stop() : this.submit()) });
    return h("div", { class: "composer" }, h("div", { class: "box" }, this.input, this.button));
  }

  isBusy() {
    return !!this.state.chatId && this.state.running.has(this.state.chatId);
  }

  updateComposer() {
    if (!this.button) return;
    this.input.placeholder = this.t("placeholder", { agent: this.agentName });
    const stop = this.isBusy() && !this.input.value.trim();
    this.button.textContent = stop ? this.t("stop") : this.t("send");
    this.button.className = stop ? "stop" : "";
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
