// Builds the .exe files in demos/, one per example, from scripts/launcher/Launcher.cs
// with the C# compiler that comes with Windows (.NET Framework 4). Nothing to install.
//
//   npm run exe
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// icon: an .ico in scripts/launcher/ (made by render-icon.mjs); the others use Windows' default
const exes = [
  { id: "blank", title: "skillframe", icon: "skillframe.ico" },
  { id: "grill-me", title: "Grill Me" },
  { id: "hello", title: "Hello Notes" },
  { id: "studio", title: "skillframe Studio" },
];

const csc = path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
if (!existsSync(csc)) {
  console.error(`The C# compiler was not found at ${csc}. The .exe files can only be built on Windows.`);
  process.exit(1);
}

const demos = path.join(root, "demos");
mkdirSync(demos, { recursive: true });
// the .exe files used to be at the repository root
for (const { title } of exes) rmSync(path.join(root, `${title}.exe`), { force: true });

for (const { id, title, icon } of exes) {
  const dir = path.join(root, ".cache", "launcher", id);
  mkdirSync(dir, { recursive: true });
  const app = path.join(dir, "App.cs");
  writeFileSync(app, `static class App { public const string Id = ${JSON.stringify(id)}; public const string Title = ${JSON.stringify(title)}; }\n`);
  const out = path.join(demos, `${title}.exe`);
  const iconArg = icon ? [`/win32icon:${path.join(root, "scripts", "launcher", icon)}`] : [];
  const r = spawnSync(csc, ["/nologo", "/target:winexe", "/optimize+", `/out:${out}`, ...iconArg, "/r:System.Windows.Forms.dll", path.join(root, "scripts", "launcher", "Launcher.cs"), app], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout + r.stderr);
    process.exit(1);
  }
  console.log(`demos/${title}.exe  ->  node scripts/window.mjs ${id}`);
}
