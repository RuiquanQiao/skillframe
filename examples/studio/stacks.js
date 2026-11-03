// Studio runs the project the way its own stack runs it: it reads the folder, picks the dev server
// command a developer of that stack would type, starts it, and finds its address in what it prints.
// A folder it doesn't recognize is served as static files (server.js). Any other command goes in
// .skillframe/run.json, which the user or the agent can write:
//
//   { "command": "uvicorn api:app --reload --port {port}", "url": "http://127.0.0.1:{port}/" }
//
// {port} is a free port Studio picked; it is also in the PORT environment variable.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const read = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};
const json = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const IS_WIN = process.platform === "win32";

/** the project's own Python (a virtual environment in the folder), else the one on PATH */
function python(folder) {
  for (const venv of [".venv", "venv", "env"]) {
    const exe = IS_WIN ? path.join(folder, venv, "Scripts", "python.exe") : path.join(folder, venv, "bin", "python");
    if (existsSync(exe)) return `"${exe}"`;
  }
  return IS_WIN ? "python" : "python3";
}

/** a Python file in the folder whose text matches */
function pyFile(folder, test) {
  for (const name of ["main.py", "app.py", "server.py", "api.py", "streamlit_app.py", "Home.py", ...readdirSafe(folder).filter((f) => f.endsWith(".py"))]) {
    const text = read(path.join(folder, name));
    if (text && test.test(text)) return name;
  }
  return null;
}
const readdirSafe = (folder) => {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
};

/**
 * What runs this project: { stack, command, url?, install? } (`command` and `url` may hold {port}),
 * or null to serve the folder's files as they are.
 */
export function detect(folder) {
  const own = json(path.join(folder, ".skillframe", "run.json"));
  if (own?.command) return { stack: own.name ?? "Custom", command: String(own.command), url: own.url, own: true };

  const pkg = json(path.join(folder, "package.json"));
  if (pkg) {
    const scripts = pkg.scripts ?? {};
    const script = ["dev", "start", "serve"].find((s) => scripts[s]);
    if (script) {
      const pm = existsSync(path.join(folder, "pnpm-lock.yaml")) ? "pnpm" : existsSync(path.join(folder, "yarn.lock")) ? "yarn"
        : existsSync(path.join(folder, "bun.lockb")) || existsSync(path.join(folder, "bun.lock")) ? "bun" : "npm";
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const stack = deps.next ? "Next.js" : deps.vite ? "Vite" : deps["@sveltejs/kit"] ? "SvelteKit" : deps.astro ? "Astro" : deps.nuxt ? "Nuxt"
        : deps["react-scripts"] ? "Create React App" : deps.express ? "Express" : "Node";
      // Vite-based servers take --port; the others read PORT
      const port = deps.vite || deps.astro || deps["@sveltejs/kit"] ? ` -- --port {port} --strictPort` : "";
      const run = pm === "npm" ? `npm run ${script}` : `${pm} run ${script}`;
      const hasDeps = Object.keys(deps).length > 0;
      return { stack, command: run + (pm === "yarn" ? port.replace(" -- ", " ") : port), install: hasDeps && !existsSync(path.join(folder, "node_modules")) ? `${pm} install` : undefined };
    }
  }
  if (existsSync(path.join(folder, "manage.py"))) return { stack: "Django", command: `${python(folder)} manage.py runserver 127.0.0.1:{port}` };
  const streamlit = pyFile(folder, /import streamlit|from streamlit/);
  if (streamlit) return { stack: "Streamlit", command: `${python(folder)} -m streamlit run ${streamlit} --server.port {port} --server.headless true` };
  const fastapi = pyFile(folder, /FastAPI\(/);
  if (fastapi) {
    const app = /^(\w+)\s*=\s*FastAPI\(/m.exec(read(path.join(folder, fastapi)))?.[1] ?? "app";
    return { stack: "FastAPI", command: `${python(folder)} -m uvicorn ${fastapi.replace(/\.py$/, "")}:${app} --reload --port {port}` };
  }
  const flask = pyFile(folder, /Flask\(__name__/);
  if (flask) return { stack: "Flask", command: `${python(folder)} -m flask --app ${flask.replace(/\.py$/, "")} run --debug --port {port}` };
  const gradio = pyFile(folder, /import gradio|from gradio/);
  if (gradio) return { stack: "Gradio", command: `${python(folder)} ${gradio}`, url: "http://127.0.0.1:{port}/", env: { GRADIO_SERVER_PORT: "{port}" } };
  if (existsSync(path.join(folder, "go.mod"))) return { stack: "Go", command: "go run .", url: "http://127.0.0.1:{port}/" };
  if (existsSync(path.join(folder, "Cargo.toml"))) return { stack: "Rust", command: "cargo run", url: "http://127.0.0.1:{port}/" };
  if (existsSync(path.join(folder, "pubspec.yaml")) && /flutter:/.test(read(path.join(folder, "pubspec.yaml")))) {
    return { stack: "Flutter", command: "flutter run -d web-server --web-hostname 127.0.0.1 --web-port {port}", url: "http://127.0.0.1:{port}/" };
  }
  if (readdirSafe(folder).some((f) => f.endsWith(".csproj"))) return { stack: ".NET", command: "dotnet watch run --urls http://127.0.0.1:{port}", url: "http://127.0.0.1:{port}/" };
  if (existsSync(path.join(folder, "bin", "rails"))) return { stack: "Rails", command: "bin/rails server -p {port}" };
  if (existsSync(path.join(folder, "artisan"))) return { stack: "Laravel", command: "php artisan serve --port={port}" };
  if (existsSync(path.join(folder, "index.php"))) return { stack: "PHP", command: "php -S 127.0.0.1:{port}", url: "http://127.0.0.1:{port}/" };
  return null;
}

// what dev servers print when they are ready: "Local: http://localhost:5173/", "Uvicorn running on http://127.0.0.1:8000"
const ADDRESS = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d+)?[^\s"'`)\]]*/;
// ANSI colors and cursor moves, which most dev servers print
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const LOG_CAP = 400;

/**
 * The project's dev server, while Studio has the project open. `on(status)` hears every change:
 * { state: "installing" | "starting" | "running" | "exited", stack, url?, code? }.
 */
export class AppRun {
  constructor(folder, spec, port, on) {
    Object.assign(this, { folder, spec, port, on });
    this.lines = [];
    this.state = "starting";
    this.url = null;
    this.proc = null;
    this.stopped = false;
  }

  fill(s) {
    return String(s ?? "").replaceAll("{port}", String(this.port));
  }

  status() {
    return { state: this.state, stack: this.spec.stack, command: this.fill(this.spec.command), url: this.url, code: this.code ?? null, own: !!this.spec.own };
  }

  log(text) {
    for (const line of String(text).replace(ANSI, "").split(/\r?\n/)) {
      if (!line.trim()) continue;
      this.lines.push(line);
      if (this.lines.length > LOG_CAP) this.lines.shift();
      if (this.state === "starting" && !this.url) {
        const m = ADDRESS.exec(line);
        if (m) this.ready(m[0].replace("0.0.0.0", "127.0.0.1").replace(/\[::1?\]/, "127.0.0.1"));
      }
    }
  }

  tail(n = 60) {
    return this.lines.slice(-n).join("\n");
  }

  ready(url) {
    if (this.stopped) return;
    this.url = url.endsWith("/") || url.includes("?") ? url : url + "/";
    this.state = "running";
    this.on(this.status());
  }

  /** one command line, through the shell like a developer's terminal (npm, pnpm and the like are shims) */
  sh(command, env) {
    const proc = spawn(command, {
      cwd: this.folder,
      shell: true,
      env: { ...process.env, PORT: String(this.port), HOST: "127.0.0.1", BROWSER: "none", FORCE_COLOR: "0", ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: !IS_WIN, // its own process group, so stop() ends what it started too
    });
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (d) => this.log(d));
    proc.stderr.on("data", (d) => this.log(d));
    return proc;
  }

  async start() {
    this.stopped = false;
    this.url = null;
    this.code = null;
    if (this.spec.install) {
      this.state = "installing";
      this.on(this.status());
      this.log(`$ ${this.spec.install}`);
      const code = await new Promise((resolve) => {
        this.proc = this.sh(this.spec.install);
        this.proc.on("exit", resolve);
        this.proc.on("error", () => resolve(1));
      });
      if (this.stopped) return;
      if (code !== 0) return this.exited(code);
      this.spec = { ...this.spec, install: undefined };
    }
    this.state = "starting";
    this.on(this.status());
    const command = this.fill(this.spec.command);
    this.log(`$ ${command}`);
    const env = Object.fromEntries(Object.entries(this.spec.env ?? {}).map(([k, v]) => [k, this.fill(v)]));
    const proc = (this.proc = this.sh(command, env));
    proc.on("error", (e) => {
      this.log(String(e.message));
      this.exited(1);
    });
    proc.on("exit", (code) => {
      if (proc === this.proc) this.exited(code);
    });
    // a server that prints no address: knock on the one it was told to use
    if (this.spec.url) this.poll(this.fill(this.spec.url), proc);
  }

  async poll(url, proc) {
    for (let i = 0; i < 600 && proc === this.proc && this.state === "starting"; i++) {
      try {
        await fetch(url, { signal: AbortSignal.timeout(1500) });
        if (proc === this.proc && this.state === "starting") this.ready(url);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  exited(code) {
    if (this.stopped) return;
    this.state = "exited";
    this.code = code;
    this.log(`(exited with code ${code})`);
    this.on(this.status());
  }

  /** ends the server and everything it started */
  stop() {
    this.stopped = true;
    const proc = this.proc;
    this.proc = null;
    if (!proc || proc.exitCode !== null || proc.pid === undefined) return;
    if (IS_WIN) spawnSync("taskkill", ["/T", "/F", "/PID", String(proc.pid)], { stdio: "ignore", windowsHide: true });
    else {
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }
    }
  }

  async restart() {
    this.stop();
    this.lines.push("(restarting)");
    await this.start();
  }
}
