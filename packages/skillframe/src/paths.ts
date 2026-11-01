import os from "node:os";
import path from "node:path";

/**
 * Where an app keeps its users' data, the way each system expects it:
 *   Windows  %APPDATA%\<name>
 *   macOS    ~/Library/Application Support/<name>
 *   Linux    $XDG_DATA_HOME/<name> (default ~/.local/share/<name>)
 *
 * Use it for `workspace` and `dataDir`: keeping the agent's working folder out of your app's
 * source repository matters, because Claude Code keeps its memory per git repository.
 */
export function appDataDir(name: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  const home = os.homedir();
  if (platform === "win32") return path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), name);
  if (platform === "darwin") return path.join(home, "Library", "Application Support", name);
  return path.join(env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), name);
}
