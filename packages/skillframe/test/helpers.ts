import { mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright-core";
import type { Skillframe } from "../src/index.js";

export const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FAKE_CLAUDE = path.join(PKG, "test/fixtures/fake-claude.mjs");
export const FAKE_CODEX = path.join(PKG, "test/fixtures/fake-codex.mjs");
export const FAKE_ACP = path.join(PKG, "test/fixtures/fake-acp.mjs");
export const TMP = path.join(PKG, ".cache/test");

/** both agents replaced by their fakes */
export const fakeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  SKILLFRAME_CLAUDE_CMD: JSON.stringify([process.execPath, FAKE_CLAUDE]),
  SKILLFRAME_CODEX_CMD: JSON.stringify([process.execPath, FAKE_CODEX]),
  SKILLFRAME_QWEN_CMD: JSON.stringify([process.execPath, FAKE_ACP]),
});

export function tmpDir(name: string): string {
  const dir = path.join(TMP, `${name}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** the Chrome or Edge already on the machine, headless; null when there is none */
export async function launchBrowser(): Promise<Browser | null> {
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try the next browser */
    }
  }
  return null;
}

/** a raw HTTP client: fetch() won't let a test set Host or Origin freely */
export function request(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; json: any; text: string }>((resolve, reject) => {
    const data = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
    const req = http.request(url, { method, headers: { ...(data !== undefined ? { "Content-Type": "application/json" } : {}), ...headers } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (text += c));
      res.on("end", () => {
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode ?? 0, json, text });
      });
    });
    req.on("error", reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}

/** the events of one chat until its chat.done */
export function untilDone(sf: Skillframe, chatId: string, onEvent?: (event: string, data: any) => void) {
  return new Promise<{ events: string[]; done: any }>((resolve) => {
    const events: string[] = [];
    const off = sf.on((event, data: any) => {
      if (data?.chat !== chatId) return;
      events.push(event);
      onEvent?.(event, data);
      if (event === "chat.done") {
        off();
        resolve({ events, done: data });
      }
    });
  });
}

/** the next event of a kind that passes `test`, or a rejection after `ms` */
export function nextEvent(sf: Skillframe, kind: string, test: (data: any) => boolean = () => true, ms = 3000) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`no ${kind} within ${ms} ms`));
    }, ms);
    const off = sf.on((event, data) => {
      if (event === kind && test(data)) {
        clearTimeout(timer);
        off();
        resolve(data);
      }
    });
  });
}
