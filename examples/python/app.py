"""A todo list written in Python (standard library only), with the user's own coding agent beside it.

Nothing of skillframe is imported: the app starts `skillframe serve` next to itself and describes
its abilities in skillframe.json. Each ability is a route of this server; skillframe calls it when
the agent uses it. The page is this app's own, opened through skillframe's address, which adds the
sidebar.

    python examples/python/app.py          (from the repository root, after npm install)

In an app of your own, start `npx skillframe serve` instead of the repository's copy.
"""
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
# APP_HOME puts the data somewhere else (the tests use it)
HOME = Path(os.environ.get("APP_HOME", HERE))
WORKSPACE = HOME / "workspace"
TODOS = WORKSPACE / "todos.json"
LOCK = threading.Lock()


def load() -> list:
    try:
        return json.loads(TODOS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def save(todos: list) -> None:
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    TODOS.write_text(json.dumps(todos, ensure_ascii=False, indent=2), encoding="utf-8")


# ---- the app's abilities: what skillframe.json offers the agent as tools
def add_todo(args: dict) -> str:
    text = str(args.get("text", "")).strip()
    if not text:
        raise ValueError("The todo's text is empty.")
    with LOCK:
        todos = load()
        todos.append({"id": max((t["id"] for t in todos), default=0) + 1, "text": text, "done": False})
        save(todos)
    return f"Added todo #{todos[-1]['id']}: {text}"


def complete_todo(args: dict) -> str:
    with LOCK:
        todos = load()
        hit = next((t for t in todos if t["id"] == int(args.get("id", 0))), None)
        if not hit:
            raise ValueError(f"There is no todo #{args.get('id')}.")
        hit["done"] = True
        save(todos)
    return f"Done: {hit['text']}"


def list_todos(_args: dict) -> str:
    return json.dumps(load(), ensure_ascii=False)


TOOLS = {"add_todo": add_todo, "complete_todo": complete_todo, "list_todos": list_todos}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def answer(self, status: int, body: str, kind: str = "text/plain; charset=utf-8") -> None:
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            return self.answer(200, (HERE / "index.html").read_text(encoding="utf-8"), "text/html; charset=utf-8")
        if self.path == "/todos":
            return self.answer(200, json.dumps(load()), "application/json")
        self.answer(404, "Not found")

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        # skillframe calls these: { "args": {...}, "chatId": "…" }
        if self.path.startswith("/agent/") and self.path[7:] in TOOLS:
            try:
                return self.answer(200, TOOLS[self.path[7:]](body.get("args") or {}))
            except (ValueError, KeyError) as e:
                return self.answer(400, str(e))   # a failed tool call; the agent reads why
        # before each message: what the user is looking at, in words
        if self.path == "/agent/context":
            screen = body.get("screen") or {}
            todos = load()
            open_ = [t for t in todos if not t["done"]]
            line = f"The user's todo list has {len(todos)} todos, {len(open_)} not done."
            if screen.get("selected"):
                line += f" They have todo #{screen['selected']} selected."
            return self.answer(200, line)
        # the page's own buttons
        if self.path == "/todos/add":
            return self.answer(200, add_todo(body))
        if self.path == "/todos/done":
            return self.answer(200, complete_todo(body))
        self.answer(404, "Not found")


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    app = f"http://127.0.0.1:{server.server_address[1]}"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    # skillframe next to the app; it ends when this process does (--parent)
    cli = REPO / "packages" / "skillframe" / "bin" / "skillframe.js"
    cmd = ["node", str(cli), "serve", str(HERE / "skillframe.json"), "--app", app, "--parent", str(os.getpid()),
           "--workspace", str(WORKSPACE), "--data-dir", str(HOME / ".data")]
    if os.environ.get("PORT"):
        cmd += ["--port", os.environ["PORT"]]
    sf = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True, encoding="utf-8")
    for line in sf.stdout:
        if "running at" in line:
            print(f"Python Todo is running at {line.split('running at ')[1].strip()}", flush=True)
            break
    else:
        sys.exit("skillframe didn't start (run `npm install` in the repository first)")
    try:
        sf.wait()
    except KeyboardInterrupt:
        sf.terminate()


if __name__ == "__main__":
    main()
