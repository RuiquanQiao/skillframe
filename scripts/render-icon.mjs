// Renders the .exe icons into scripts/launcher/ (16 to 256 px, PNG inside, which Windows reads
// since Vista) with the Chrome or Edge on this computer:  node scripts/render-icon.mjs
//   docs/media/icon.svg  -> skillframe.ico  (skillframe.exe)
// build-exe.mjs puts each .ico into its .exe.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icons = [
  { from: "docs/media/icon.svg", type: "image/svg+xml", out: "skillframe.ico" },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
for (const icon of icons) {
  const src = `data:${icon.type};base64,${readFileSync(path.join(root, icon.from)).toString("base64")}`;
  const pngs = [];
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${src}">`);
    await page.locator("img").evaluate((img) => img.decode());
    pngs.push(await page.locator("img").screenshot({ omitBackground: true }));
  }
  const out = path.join(root, "scripts", "launcher", icon.out);
  writeFileSync(out, ico(pngs));
  console.log(`${path.relative(root, out)}  (${sizes.join(", ")} px)`);
}
await browser.close();

/** ICONDIR, then one ICONDIRENTRY per image, then the images */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((size, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size % 256, e); // 0 means 256
    head.writeUInt8(size % 256, e + 1);
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(pngs[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  return Buffer.concat([head, ...pngs]);
}
