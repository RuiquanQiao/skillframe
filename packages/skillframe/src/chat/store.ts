// Display copies of conversations, kept in the host app's data folder. The agent keeps the real
// history in its own session (resumed by id), so this is only what the sidebar draws.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChatMeta, Message } from "./types.js";

const now = () => Math.round(Date.now()) / 1000;

function writeAtomic(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 1), "utf8");
  renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export class ChatStore {
  constructor(readonly root: string) {}

  private get indexPath(): string {
    return path.join(this.root, "index.json");
  }

  private messagesPath(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new Error(`bad chat id ${id}`);
    return path.join(this.root, `${id}.json`);
  }

  list(): ChatMeta[] {
    return readJson<ChatMeta[]>(this.indexPath, []).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  meta(id: string): ChatMeta | undefined {
    return this.list().find((c) => c.id === id);
  }

  create(fields: Partial<ChatMeta> = {}): ChatMeta {
    const t = now();
    const chat: ChatMeta = { title: "", agent: "claude", ...fields, id: randomUUID().slice(0, 12), createdAt: t, updatedAt: t };
    writeAtomic(this.indexPath, [...this.list(), chat]);
    return chat;
  }

  update(id: string, fields: Partial<ChatMeta>, touch = true): ChatMeta | undefined {
    const all = this.list();
    const chat = all.find((c) => c.id === id);
    if (!chat) return undefined;
    Object.assign(chat, fields, { id }, touch ? { updatedAt: now() } : {});
    writeAtomic(this.indexPath, all);
    return chat;
  }

  delete(id: string): void {
    writeAtomic(this.indexPath, this.list().filter((c) => c.id !== id));
    rmSync(this.messagesPath(id), { force: true });
  }

  messages(id: string): Message[] {
    return readJson<Message[]>(this.messagesPath(id), []);
  }

  append(id: string, msg: Message): void {
    writeAtomic(this.messagesPath(id), [...this.messages(id), msg]);
  }
}
