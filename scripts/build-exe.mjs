// Builds the .exe files in demos/, one per example, from scripts/launcher/Launcher.cs
// with the C# compiler that comes with Windows (.NET Framework 4). Nothing to install.
//
//   npm run exe
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// icon: an .ico in scripts/launcher/ (made by render-icon.mjs); the others use Windows' default
const exes = [
  { id: "blank", title: "skillframe", icon: "skillframe.ico" },
  { id: "grill-me", title: "Grill Me" },
  { id: "hello", title: "Hello Notes" },
  { id: "studio", title: "skillframe Studio" },
  { id: "python", title: "Python Todo" },
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
  const r = spawnSync(csc, ["/nologo", "/codepage:65001", "/target:winexe", "/optimize+", `/out:${out}`, ...iconArg, "/r:System.Windows.Forms.dll", path.join(root, "scripts", "launcher", "Launcher.cs"), app], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout + r.stderr);
    process.exit(1);
  }
  console.log(`demos/${title}.exe  ->  node scripts/window.mjs ${id}`);
}

// The window they open: demos/skillframe-window.exe, a native WebView2 window (Window.cs). It needs
// Microsoft's WebView2 SDK, fetched once from nuget.org into .cache/nuget; its three files go next
// to the .exe (Microsoft lets apps ship them).
const WEBVIEW2 = "1.0.4314.35";
const sdk = path.join(root, ".cache", "nuget", `webview2-${WEBVIEW2}`);
if (!existsSync(path.join(sdk, "lib", "net462", "Microsoft.Web.WebView2.Core.dll"))) {
  console.log(`Fetching the WebView2 SDK ${WEBVIEW2} from nuget.org…`);
  const res = await fetch(`https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${WEBVIEW2}/microsoft.web.webview2.${WEBVIEW2}.nupkg`);
  if (!res.ok) {
    console.error(`Couldn't download the WebView2 SDK (${res.status}). The demos will open in an Edge window instead.`);
    process.exit(0);
  }
  mkdirSync(sdk, { recursive: true });
  const zip = path.join(sdk, "sdk.zip");
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  // a .nupkg is a zip; tar on Windows 10 and later opens zips
  const x = spawnSync("tar", ["-xf", zip, "-C", sdk], { encoding: "utf8" });
  if (x.status !== 0) {
    console.error(x.stderr);
    process.exit(1);
  }
}
const lib = path.join(sdk, "lib", "net462");
const w = spawnSync(csc, [
  "/nologo", "/codepage:65001", "/target:winexe", "/optimize+", "/platform:x64", `/out:${path.join(demos, "skillframe-window.exe")}`,
  `/win32icon:${path.join(root, "scripts", "launcher", "skillframe.ico")}`,
  "/r:System.Windows.Forms.dll", "/r:System.Drawing.dll",
  `/r:${path.join(lib, "Microsoft.Web.WebView2.Core.dll")}`, `/r:${path.join(lib, "Microsoft.Web.WebView2.WinForms.dll")}`,
  path.join(root, "scripts", "launcher", "Window.cs"),
], { encoding: "utf8" });
if (w.status !== 0) {
  console.error(w.stdout + w.stderr);
  process.exit(1);
}
for (const f of ["Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll"]) copyFileSync(path.join(lib, f), path.join(demos, f));
copyFileSync(path.join(sdk, "runtimes", "win-x64", "native", "WebView2Loader.dll"), path.join(demos, "WebView2Loader.dll"));
console.log("demos/skillframe-window.exe  (the native window they open)");
