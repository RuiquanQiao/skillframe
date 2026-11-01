// Renders docs/media/banner.html to banner-light.png and banner-dark.png (transparent, 2x) with
// the Chrome or Edge on this computer:  node scripts/render-banner.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const media = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs/media");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 220 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(media, "banner.html")).href);
for (const theme of ["light", "dark"]) {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await page.locator(".banner").screenshot({ path: path.join(media, `banner-${theme}.png`), omitBackground: true });
}
await browser.close();
console.log("banner-light.png, banner-dark.png");
