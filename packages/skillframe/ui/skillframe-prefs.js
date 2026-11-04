// The user's own settings for skillframe's elements: the language and the theme.
//
// Kept in this page's storage and shared by every skillframe element on the page (and by the app's
// other windows, through the storage event). An empty value follows the system. The user picks them
// in <skillframe-titlebar>'s settings; an app with settings of its own can call prefs.set() itself.
//
//   import { prefs } from "/sf/ui/skillframe-prefs.js";
//   prefs.set("lang", "zh");      // "" (the system's) | "en" | "zh"
//   prefs.set("theme", "dark");   // "" (the system's) | "light" | "dark"
//
// The theme also lands on the page: <html data-sf-theme="dark"> and its color-scheme, so an app
// styled with Canvas / CanvasText follows along, and one with colors of its own can key on it.

/** the languages skillframe's elements speak, each in its own name */
export const LANGUAGES = [{ id: "en", name: "English" }, { id: "zh", name: "中文" }];
/** fired on window when a setting changes: detail { key, value } */
export const PREF_EVENT = "skillframe-prefs";

const memo = {}; // storage blocked: still applied to this page

export const prefs = {
  get(key) {
    try {
      return localStorage.getItem(`skillframe.${key}`) || memo[key] || "";
    } catch {
      return memo[key] || "";
    }
  },
  /** key "lang" or "theme"; "" goes back to the system's */
  set(key, value) {
    memo[key] = value;
    try {
      if (value) localStorage.setItem(`skillframe.${key}`, value);
      else localStorage.removeItem(`skillframe.${key}`);
    } catch {
      /* not remembered past this page */
    }
    applyPageTheme();
    window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: { key, value } }));
  },
};

const known = (l) => LANGUAGES.some((x) => x.id === l);

/** the system's language, when skillframe speaks it; English otherwise */
export const systemLang = () => {
  const l = (globalThis.navigator?.language || "en").slice(0, 2);
  return known(l) ? l : "en";
};

/** the language an element speaks: the user's pick, else the app's (its lang="…"), else the system's */
export const langFor = (appLang) => {
  const l = (prefs.get("lang") || appLang || globalThis.navigator?.language || "en").slice(0, 2);
  return known(l) ? l : "en";
};

function applyPageTheme() {
  if (typeof document === "undefined") return; // loaded in plain Node (the md() tests)
  const t = prefs.get("theme");
  const root = document.documentElement;
  if (t) {
    root.dataset.sfTheme = t;
    root.style.colorScheme = t;
  } else {
    delete root.dataset.sfTheme;
    root.style.removeProperty("color-scheme");
  }
}
applyPageTheme();

// another window of the same app changed a setting
globalThis.window?.addEventListener("storage", (e) => {
  if (!e.key?.startsWith("skillframe.")) return;
  applyPageTheme();
  window.dispatchEvent(new CustomEvent(PREF_EVENT, { detail: { key: e.key.slice("skillframe.".length), value: e.newValue || "" } }));
});
