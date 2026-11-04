// <skillframe-titlebar name="Paper Lab" logo="/icon.svg">: the app's title bar, as a Web Component.
//
// The app's own brand on the left (its logo and name; by default the page's icon and title), room
// for the app's own navigation and buttons, the settings (language, theme), and, in a window that
// gives the page its title bar (skillframe's native window does), minimize / maximize / close.
// The bar is the window's real title bar there: drag it to move or snap the window, double-click it
// to maximize, right-click it for the window menu. In a browser tab it is the app's header.
//
//   <skillframe-titlebar name="Paper Lab" logo="/logo.svg">
//     <nav slot="center">…</nav>              the app's tabs, in the middle
//     <button slot="actions">…</button>       the app's buttons, left of the settings
//     <div slot="settings">…</div>            the app's own settings, under skillframe's in the panel
//   </skillframe-titlebar>
//
//   settings="theme"     which settings to offer: "language theme" (the default), one of them, or "off"
//                        (an app whose own words are in one language offers "theme" only; an app with
//                        settings of its own can say "off" and call prefs.set() from skillframe-prefs.js)
//   events: "settings-change" ({ key: "lang" | "theme", value })
//   colors: set --tb-bg, --tb-ink, --tb-muted, --tb-line, --tb-accent on the element to match the app
//
// In Electron, give the BrowserWindow `titleBarStyle: "hidden"` and `titleBarOverlay: { height: 40 }`:
// the bar drags the window, Electron draws the window's buttons, and the bar leaves them room.
import { LANGUAGES, langFor, PREF_EVENT, prefs, systemLang } from "./skillframe-prefs.js";

const STRINGS = {
  en: {
    settings: "Settings", language: "Language", theme: "Theme", followSystem: "System", followSystemLang: "System ({lang})",
    light: "Light", dark: "Dark", minimize: "Minimize", maximize: "Maximize", restore: "Restore", close: "Close",
  },
  zh: {
    settings: "设置", language: "语言", theme: "外观", followSystem: "跟随系统", followSystemLang: "跟随系统（{lang}）",
    light: "浅色", dark: "深色", minimize: "最小化", maximize: "最大化", restore: "还原", close: "关闭",
  },
};
const tr = (lang, key, vars = {}) => ((STRINGS[lang] || STRINGS.en)[key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

const CSS = `
:host {
  --tb-bg: #F6F7F9; --tb-ink: #1B1E23; --tb-muted: #6A707A; --tb-line: #E3E6EA; --tb-hover: rgba(27, 30, 35, .07);
  --tb-pop: #FFFFFF; --tb-shadow: 0 10px 28px rgba(16, 24, 40, .14), 0 2px 6px rgba(16, 24, 40, .06);
  --tb-accent: #2F5FD0; --tb-close: #C42B1C;
  --tb-height: 40px;
  display: block; flex: none; position: relative; z-index: 30;
  font: inherit; font-size: 13px; line-height: 1.4; color: var(--tb-ink);
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --tb-bg: #1C1F23; --tb-ink: #E6E8EB; --tb-muted: #9AA1AA; --tb-line: #2E3238; --tb-hover: rgba(255, 255, 255, .08);
    --tb-pop: #24272C; --tb-shadow: 0 12px 32px rgba(0, 0, 0, .5), 0 0 0 1px rgba(255, 255, 255, .06); --tb-accent: #7FA2FF;
  }
}
:host([data-theme="dark"]) {
  --tb-bg: #1C1F23; --tb-ink: #E6E8EB; --tb-muted: #9AA1AA; --tb-line: #2E3238; --tb-hover: rgba(255, 255, 255, .08);
  --tb-pop: #24272C; --tb-shadow: 0 12px 32px rgba(0, 0, 0, .5), 0 0 0 1px rgba(255, 255, 255, .06); --tb-accent: #7FA2FF;
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px solid var(--tb-accent); outline-offset: -2px; }

/* the bar: everything that is not a control drags the window */
.bar { height: var(--tb-height); display: flex; align-items: center; gap: 12px; padding-left: 14px; background: var(--tb-bg); border-bottom: 1px solid var(--tb-line);
  app-region: drag; -webkit-app-region: drag; user-select: none; -webkit-user-select: none; min-width: 0;
  /* a window whose own buttons sit over the page (Electron's titleBarOverlay): room for them */
  padding-right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)); }
button, input, a, ::slotted(*) { app-region: no-drag; -webkit-app-region: no-drag; }

.brand { display: flex; align-items: center; gap: 9px; min-width: 0; flex: 0 1 auto; }
.logo { width: 20px; height: 20px; flex: none; object-fit: contain; border-radius: 5px; }
.mono { width: 20px; height: 20px; flex: none; border-radius: 5px; display: grid; place-items: center; background: #2F5FD0; color: #fff; font-size: 11px; font-weight: 700; line-height: 1; }
::slotted([slot="logo"]) { width: 20px; height: 20px; flex: none; }
.name { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; letter-spacing: .005em; }
.center { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; height: 100%; }
.actions { display: flex; align-items: center; gap: 2px; flex: none; padding-right: 8px; }
.ib { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 28px; border: 0; border-radius: 6px; background: none; color: var(--tb-muted); }
.ib:hover, .ib[aria-expanded="true"] { background: var(--tb-hover); color: var(--tb-ink); }
.ic { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }

/* minimize / maximize / close, sized and drawn like Windows 11's own */
.caption { display: flex; align-self: stretch; flex: none; }
.caption[hidden] { display: none; }
.cb { width: 46px; height: 100%; border: 0; background: none; color: var(--tb-ink); display: grid; place-items: center; }
.cb svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1; shape-rendering: crispEdges; }
.cb.close svg { shape-rendering: geometricPrecision; }
.cb:hover { background: var(--tb-hover); }
.cb.close:hover { background: var(--tb-close); color: #fff; }
.cb:focus-visible { outline-offset: -3px; }
:host([inactive]) .name, :host([inactive]) .cb:not(:hover) { opacity: .5; }

/* the window's top edge resizes it (the page covers where Windows' own edge would be) */
.edge { position: absolute; top: 0; height: 4px; app-region: no-drag; -webkit-app-region: no-drag; z-index: 1; }
.edge[hidden] { display: none; }
.edge.t { left: 8px; right: 8px; cursor: ns-resize; }
.edge.tl { left: 0; width: 8px; cursor: nwse-resize; }
.edge.tr { right: 0; width: 8px; cursor: nesw-resize; }

/* the settings panel */
.pop { position: fixed; z-index: 2147483000; width: 260px; max-width: calc(100vw - 16px); max-height: calc(100vh - var(--tb-height) - 16px); overflow-y: auto;
  background: var(--tb-pop); color: var(--tb-ink); border: 1px solid var(--tb-line); border-radius: 10px; box-shadow: var(--tb-shadow); padding: 4px; }
.pop:focus { outline: none; }
.pop .head { padding: 8px 8px 2px; color: var(--tb-muted); font-size: 12px; }
.pop .head:first-child { padding-top: 6px; }
.pop .sep { height: 1px; background: var(--tb-line); margin: 4px 2px; }
.mi { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; border-radius: 6px; padding: 6px 8px; text-align: left; }
.mi:hover, .mi:focus-visible { background: var(--tb-hover); outline: none; }
.mi .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mi .ic { color: var(--tb-accent); }
.mi[aria-checked="false"] .ic { visibility: hidden; }
.seg { display: flex; gap: 2px; margin: 4px 6px 6px; padding: 2px; border-radius: 8px; background: var(--tb-hover); }
.seg button { flex: 1; border: 0; background: none; border-radius: 6px; padding: 4px 6px; font-size: 12px; color: var(--tb-muted); white-space: nowrap; }
.seg button:hover { color: var(--tb-ink); }
.seg button[aria-checked="true"] { background: var(--tb-pop); color: var(--tb-ink); box-shadow: 0 1px 2px rgba(16, 24, 40, .12); }
`;

const ICONS = {
  // drawn on a 24 grid (Lucide's "settings", ISC license)
  gear: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  check: "M3.5 8.5 6.5 11.5 12.5 4.5",
};
const CAPTION = {
  minimize: "M0 5.5h10",
  maximize: "M.5.5h9v9h-9z",
  restore: "M.5 2.5h7v7h-7zM2.5 2.5v-2h7v7h-2",
  close: "M0 0l10 10M10 0 0 10",
};

const svg = (d, cls) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", cls === "cb" ? "0 0 10 10" : cls === "24" ? "0 0 24 24" : "0 0 16 16");
  s.setAttribute("aria-hidden", "true");
  if (cls !== "cb") s.classList.add("ic");
  if (cls === "24") s.style.strokeWidth = "1.9";
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

/** the host window (skillframe's native window), when the page runs in one */
const host = () => globalThis.chrome?.webview ?? null;

class SkillframeTitlebar extends HTMLElement {
  static get observedAttributes() {
    return ["name", "logo", "settings", "lang"];
  }

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.win = { custom: false, maximized: false, active: true };
    this.pop = null;
  }

  get lang() {
    return langFor(this.getAttribute("lang"));
  }

  t(key, vars) {
    return tr(this.lang, key, vars);
  }

  connectedCallback() {
    this.onPrefs = () => {
      this.applyTheme();
      this.render();
    };
    this.onDown = (e) => {
      if (this.pop && !e.composedPath().includes(this.pop) && !e.composedPath().includes(this.gear)) this.closePop();
    };
    this.onResize = () => this.closePop();
    this.onMessage = (e) => {
      const d = e.data;
      if (!d || d.sf !== "window") return;
      this.win = { custom: !!d.custom, maximized: !!d.maximized, active: d.active !== false };
      this.toggleAttribute("inactive", !this.win.active);
      this.render();
    };
    window.addEventListener(PREF_EVENT, this.onPrefs);
    document.addEventListener("pointerdown", this.onDown, true);
    window.addEventListener("resize", this.onResize);
    host()?.addEventListener("message", this.onMessage);
    this.applyTheme();
    this.render();
    // tell the window the page draws its title bar; it answers with its state ("window")
    host()?.postMessage("sf:titlebar");
  }

  disconnectedCallback() {
    window.removeEventListener(PREF_EVENT, this.onPrefs);
    document.removeEventListener("pointerdown", this.onDown, true);
    window.removeEventListener("resize", this.onResize);
    host()?.removeEventListener("message", this.onMessage);
    this.closePop();
  }

  attributeChangedCallback() {
    if (this.isConnected && this.bar) this.render();
  }

  applyTheme() {
    const t = prefs.get("theme");
    if (t) this.dataset.theme = t;
    else delete this.dataset.theme;
  }

  /** the settings this bar offers: "lang", "theme" */
  get offers() {
    const s = (this.getAttribute("settings") ?? "language theme").toLowerCase();
    if (s === "off") return [];
    return [/\blang/.test(s) && "lang", /\btheme\b/.test(s) && "theme"].filter(Boolean);
  }

  /** the app's name: name="…", else the page's title (without the sidebar's "● " mark) */
  get appName() {
    return this.getAttribute("name") || document.title.replace(/^● /, "") || "";
  }

  /** the app's logo: logo="…", else the page's icon */
  get logoUrl() {
    if (this.hasAttribute("logo")) return this.getAttribute("logo");
    return document.querySelector('link[rel~="icon"]')?.getAttribute("href") || "";
  }

  render() {
    const name = this.appName;
    const logo = this.logoUrl;
    const mark = logo ? h("img", { class: "logo", src: logo, alt: "" }) : h("span", { class: "mono", "aria-hidden": "true" }, (name.trim()[0] || "·").toUpperCase());
    const brand = h("div", { class: "brand" }, h("slot", { name: "logo" }, mark), h("span", { class: "name", title: name }, name));

    const actions = h("div", { class: "actions" }, h("slot", { name: "actions" }));
    if (this.offers.length) {
      this.gear = h("button", { type: "button", class: "ib gear", "aria-haspopup": "dialog", "aria-expanded": String(!!this.pop), "aria-label": this.t("settings"), title: this.t("settings"),
        onclick: () => (this.pop ? this.closePop() : this.openSettings()) }, svg(ICONS.gear, "24"));
      actions.append(this.gear);
    }

    const { custom, maximized } = this.win;
    const send = (what) => host()?.postMessage(`sf:${what}`);
    const caption = h("div", { class: "caption", hidden: !custom },
      h("button", { type: "button", class: "cb min", tabindex: "-1", "aria-label": this.t("minimize"), title: this.t("minimize"), onclick: () => send("minimize") }, svg(CAPTION.minimize, "cb")),
      h("button", { type: "button", class: "cb max", tabindex: "-1", "aria-label": this.t(maximized ? "restore" : "maximize"), title: this.t(maximized ? "restore" : "maximize"), onclick: () => send("maximize") }, svg(maximized ? CAPTION.restore : CAPTION.maximize, "cb")),
      h("button", { type: "button", class: "cb close", tabindex: "-1", "aria-label": this.t("close"), title: this.t("close"), onclick: () => send("close") }, svg(CAPTION.close, "cb")));

    const edge = (cls, what) => h("div", { class: `edge ${cls}`, hidden: !custom || maximized, onpointerdown: (e) => {
      if (e.button === 0) send(what);
    } });

    this.bar = h("div", { class: "bar", part: "bar" }, brand, h("div", { class: "center" }, h("slot", { name: "center" })), actions, caption);
    const style = h("style", {}, CSS);
    const keep = this.pop;
    this.root.replaceChildren(style, this.bar, edge("t", "resize-top"), edge("tl", "resize-topleft"), edge("tr", "resize-topright"));
    if (keep) {
      // a redraw (language, theme) while the settings are open: open them again in place
      this.pop = null;
      this.openSettings(false);
    }
  }

  openSettings(focus = true) {
    this.closePop();
    const lang = prefs.get("lang");
    const theme = prefs.get("theme");
    const set = (key, value) => {
      prefs.set(key, value);
      this.dispatchEvent(new CustomEvent("settings-change", { detail: { key, value }, bubbles: true, composed: true }));
    };
    const sys = LANGUAGES.find((l) => l.id === systemLang())?.name ?? "English";
    const langRow = (id, label) => h("button", { type: "button", class: "mi", role: "menuitemradio", "aria-checked": String(lang === id), onclick: () => set("lang", id) },
      svg(ICONS.check), h("span", { class: "label" }, label));
    const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": this.t("theme") },
      ...[["", "followSystem"], ["light", "light"], ["dark", "dark"]].map(([id, key]) =>
        h("button", { type: "button", role: "radio", "aria-checked": String(theme === id), onclick: () => set("theme", id) }, this.t(key))));
    const offers = this.offers;
    const panel = h("div", { class: "pop", role: "dialog", "aria-label": this.t("settings"), tabindex: "-1" },
      offers.includes("lang") ? [h("div", { class: "head" }, this.t("language")), langRow("", this.t("followSystemLang", { lang: sys })), ...LANGUAGES.map((l) => langRow(l.id, l.name))] : null,
      offers.includes("theme") ? [h("div", { class: "head" }, this.t("theme")), seg] : null,
      // the app's own settings, when it put any in slot="settings"
      this.querySelector(':scope > [slot="settings"]') ? [h("div", { class: "sep" }), h("slot", { name: "settings" })] : null);
    panel.addEventListener("keydown", (e) => this.popKeys(e));
    this.root.append(panel);
    this.pop = panel;
    this.gear?.setAttribute("aria-expanded", "true");
    const r = this.gear.getBoundingClientRect();
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.left = `${Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, r.right - panel.offsetWidth))}px`;
    if (focus) (panel.querySelector('[aria-checked="true"]') ?? panel).focus({ preventScroll: true });
  }

  popKeys(e) {
    const items = [...this.pop.querySelectorAll("button")];
    const i = items.indexOf(this.root.activeElement);
    const go = (n) => items[(n + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? -1 : i - 1);
    else if (e.key === "Escape") {
      this.closePop();
      this.gear?.focus();
    } else return;
    e.preventDefault();
  }

  closePop() {
    if (!this.pop) return;
    this.pop.remove();
    this.pop = null;
    this.gear?.setAttribute("aria-expanded", "false");
  }
}

if (!customElements.get("skillframe-titlebar")) customElements.define("skillframe-titlebar", SkillframeTitlebar);
export { SkillframeTitlebar };
