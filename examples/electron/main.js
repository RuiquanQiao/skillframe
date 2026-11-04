// skillframe inside Electron: the main process runs skillframe's local server, the window shows
// your page with the sidebar in it. Nothing Electron-specific is needed beyond loading the URL.
//
//   npm install && npm start        (npm run smoke: open, check the sidebar drew, quit)
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSkillframe } from "skillframe";

const here = path.dirname(fileURLToPath(import.meta.url));
const smoke = process.argv.includes("--smoke");

app.whenReady().then(async () => {
  // Electron's own place for the user's data (outside this source folder)
  const home = app.getPath("userData");
  const sf = createSkillframe({
    appName: "Electron Example",
    workspace: path.join(home, "workspace"),
    dataDir: path.join(home, "skillframe"),
    static: path.join(here, "public"),
  });
  const { url } = await sf.listen();

  // the page's <skillframe-titlebar> is the title bar; Electron draws only the window's buttons, over its right end
  const win = new BrowserWindow({
    width: 1100, height: 720, show: !smoke, title: "Electron Example",
    titleBarStyle: "hidden",
    titleBarOverlay: { height: 40, color: "#00000000", symbolColor: "#6A707A" },
  });
  await win.loadURL(url);

  app.on("window-all-closed", async () => {
    await sf.close();
    app.quit();
  });

  if (smoke) {
    // the sidebar loaded its data and drew its header and message box
    let ok = false;
    for (let i = 0; i < 50 && !ok; i++) {
      await new Promise((r) => setTimeout(r, 200));
      ok = await win.webContents.executeJavaScript(
        `(() => { const r = document.querySelector("skillframe-chat")?.shadowRoot; const t = document.querySelector("skillframe-titlebar")?.shadowRoot;
          return !!(r && r.querySelector(".bar .chat-btn") && r.querySelector("textarea") && t?.querySelector(".name")?.textContent); })()`,
      );
    }
    console.log(ok ? `SMOKE OK ${url} (Electron ${process.versions.electron}, Node ${process.versions.node})` : "SMOKE FAILED: the sidebar did not draw");
    await sf.close();
    app.exit(ok ? 0 : 1);
  }
});
