// Server-sent events: every open page (and any in-process listener) gets every event.
import type { ServerResponse } from "node:http";

export type Listener = (event: string, data: unknown) => void;

export class EventBus {
  private clients = new Set<ServerResponse>();
  private listeners = new Set<Listener>();
  private ping: NodeJS.Timeout;

  constructor() {
    // a comment line now and then keeps proxies and sleeping laptops from dropping the stream
    this.ping = setInterval(() => this.clients.forEach((c) => c.write(": ping\n\n")), 20_000);
    this.ping.unref();
  }

  /** how many pages have the stream open (scripts/window.mjs keeps the server while one does) */
  get pages(): number {
    return this.clients.size;
  }

  attach(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  publish(event: string, data: unknown): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((c) => c.write(frame));
    this.listeners.forEach((fn) => {
      try {
        fn(event, data);
      } catch {
        /* a listener's bug must not stop the others */
      }
    });
  }

  close(): void {
    clearInterval(this.ping);
    this.clients.forEach((c) => c.end());
    this.clients.clear();
  }
}
