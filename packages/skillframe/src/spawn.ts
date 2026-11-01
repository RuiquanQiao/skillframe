// Finding and starting the user's own agent command, the way their terminal would.
//
// On Windows, npm installs a command as a `.cmd` shim, and Node can't start a `.cmd` without a
// shell (since the 2024 security fix it throws EINVAL). Going through cmd.exe would mean quoting
// every argument for cmd's rules, so for npm's own shim layouts we read the shim and start what it
// points at directly (Claude Code's points at a native claude.exe). Anything else goes through
// cmd.exe with its arguments quoted.
import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface Command {
  file: string;
  args: string[];
  /** true: `file` is a .cmd/.bat started through cmd.exe */
  shell?: boolean;
}

const IS_WIN = process.platform === "win32";

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** The full path of `name` on PATH (with PATHEXT on Windows), or null. */
export function which(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const dirs = (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
  if (path.isAbsolute(name)) dirs.unshift("");
  const exts = IS_WIN ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = dir ? path.join(dir, name + ext) : name + ext;
      if (!isFile(p)) continue;
      if (IS_WIN) return p;
      try {
        accessSync(p, constants.X_OK);
        return p;
      } catch {
        /* not executable: keep looking */
      }
    }
  }
  return null;
}

/** What an npm `.cmd` shim runs, read from the shim itself; null when it isn't one we know. */
export function readShim(shim: string): Command | null {
  let text: string;
  try {
    text = readFileSync(shim, "utf8");
  } catch {
    return null;
  }
  const dir = path.dirname(shim);
  // every "%dp0%\..." (or "%~dp0\...") path the shim names, in order. The shim writes Windows
  // separators: split on them, so this reads the same on every system
  const targets = [...text.matchAll(/"%~?dp0%?\\([^"]+)"/g)].map((m) => path.join(dir, ...m[1].split("\\")));
  const exe = targets.find((t) => /\.(exe|com)$/i.test(t) && !/[\\/]node\.exe$/i.test(t));
  if (exe && isFile(exe)) return { file: exe, args: [] };
  const script = targets.find((t) => /\.(c|m)?js$/i.test(t));
  if (script && isFile(script)) {
    const localNode = path.join(dir, "node.exe");
    return { file: isFile(localNode) ? localNode : process.execPath, args: [script] };
  }
  return null;
}

/**
 * The command for an agent: `SKILLFRAME_<ID>_CMD` (a JSON list, used by tests to put a fake agent
 * in its place) or `exe` found on PATH.
 */
export function resolveCommand(id: string, exe: string, env: NodeJS.ProcessEnv = process.env): Command | null {
  const override = env[`SKILLFRAME_${id.toUpperCase()}_CMD`];
  if (override) {
    const list = JSON.parse(override) as string[];
    return { file: list[0], args: list.slice(1) };
  }
  const found = which(exe, env);
  if (!found) return null;
  if (IS_WIN && /\.(cmd|bat)$/i.test(found)) return readShim(found) ?? { file: found, args: [], shell: true };
  return { file: found, args: [] };
}

// cmd.exe quoting, as cross-spawn does it: the C runtime's rules for the program's argv, then a
// caret before each of cmd's special characters, twice when the target is itself a .cmd/.bat
// (its `%*` hands the line to cmd a second time).
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

function quoteForCmd(arg: string, twice: boolean): string {
  let s = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  s = `"${s}"`.replace(CMD_META, "^$1");
  return twice ? s.replace(CMD_META, "^$1") : s;
}

export function start(cmd: Command, extra: string[], options: SpawnOptions): ChildProcess {
  const args = [...cmd.args, ...extra];
  if (cmd.shell) {
    const twice = /\.(cmd|bat)$/i.test(cmd.file);
    const line = [cmd.file.replace(CMD_META, "^$1"), ...args.map((a) => quoteForCmd(a, twice))].join(" ");
    return spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${line}"`], {
      ...options,
      windowsVerbatimArguments: true,
      windowsHide: true,
    });
  }
  return spawn(cmd.file, args, { ...options, windowsHide: true });
}

/** End a process and, on Windows, everything it started (a shim's child keeps running otherwise). */
export function kill(proc: ChildProcess | undefined): void {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null || proc.pid === undefined) return;
  if (IS_WIN) spawnSync("taskkill", ["/T", "/F", "/PID", String(proc.pid)], { windowsHide: true, stdio: "ignore" });
  else proc.kill("SIGTERM");
}
