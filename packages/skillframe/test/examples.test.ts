// The example apps in examples/, run as a user would: their own server.js, a real browser on their
// page, and a fake agent calling their tools.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { Page } from "playwright-core";
import { fakeEnv, launchBrowser, PKG, request, tmpDir } from "./helpers.js";

const EXAMPLES = path.resolve(PKG, "../../examples");

/** starts an example's server.js with fake agents and its data in `home`; resolves with its address */
function start(dir: string, home: string, env: NodeJS.ProcessEnv = {}) {
  const server = spawn(process.execPath, ["server.js"], { cwd: dir, env: { ...fakeEnv(), PORT: "0", APP_HOME: home, ...env } });
  const url = new Promise<string>((resolve, reject) => {
    let out = "";
    server.stdout!.on("data", (d) => {
      out += d;
      const m = out.match(/running at (http:\/\/\S+?)\/?\s/);
      if (m) resolve(m[1]);
    });
    server.on("exit", (code) => reject(new Error(`the example exited (${code}): ${out}`)));
  });
  return url.then((u) => ({ server, url: u }));
}

/** has the fake agent call one of the app's tools, in a chat of its own; resolves with the result */
async function call(url: string, tool: string, args: unknown, status = "done"): Promise<string> {
  const chat = (await request(`${url}/sf/chats`, "POST", { agent: "claude" })).json.id;
  await request(`${url}/sf/chats/${chat}/send`, "POST", { text: `call ${tool} ${JSON.stringify(args)}` });
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const m = (await request(`${url}/sf/chats/${chat}`, "GET")).json;
    if (!m.live && m.messages.length === 2) {
      const step = m.messages[1].blocks.find((b: any) => b.type === "tool");
      assert.equal(step?.status, status, JSON.stringify(m.messages[1].blocks));
      return step.result;
    }
  }
  throw new Error(`${tool} never finished`);
}

describe("examples/grill-me", async () => {
  const browser = await launchBrowser();
  const home = tmpDir("grill-me");
  const grill = () => JSON.parse(readFileSync(path.join(home, "workspace/grill.json"), "utf8"));
  let server: ChildProcess;
  let url: string;
  let page: Page;

  before(async () => {
    ({ server, url } = await start(path.join(EXAMPLES, "grill-me"), home));
  });

  after(async () => {
    await browser?.close();
    server?.kill();
  });

  const view = () => page.locator("#view");
  const tree = () => page.locator("#tree");
  /** the sidebar is done with the turn the page started */
  const idle = () => page.locator("skillframe-chat button.send", { hasText: "Send" }).waitFor();

  test("first run: the skill is in the agent's folder and the tree is empty", async () => {
    assert.ok(existsSync(path.join(home, "workspace/.claude/skills/grilling/SKILL.md")));
    assert.match(readFileSync(path.join(home, "workspace/.claude/skills/grilling/SKILL.md"), "utf8"), /ask_round/);
    assert.deepEqual(grill(), { idea: "", questions: [], summary: null, confirmed: false });
  });

  test("a whole session in the browser: start, two rounds, a changed answer, the summary", { skip: browser ? false : "no Chrome, Edge or Playwright Chromium on this machine" }, async () => {
    page = await browser!.newPage({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
    page.setDefaultTimeout(10_000);
    await page.goto(url + "/");

    // start: the idea is saved and goes to the agent with the skill's path
    await view().getByRole("heading", { name: "What do you want to think through?" }).waitFor();
    await page.locator("#idea").fill("A coffee subscription for offices");
    await view().getByRole("button", { name: "Start grilling" }).click();
    await page.locator("skillframe-chat .md", { hasText: ".claude/skills/grilling/SKILL.md" }).waitFor();
    await idle();
    assert.equal(grill().idea, "A coffee subscription for offices");

    // round 1 arrives on the screen and in the tree
    assert.match(
      await call(url, "ask_round", {
        questions: [
          { title: "Who buys it", body: "The office manager, or each employee?", recommended: "The office manager", options: ["Each employee"] },
          { title: "Price", body: "Per office per month.", recommended: "$200" },
        ],
      }),
      /Q1, Q2/,
    );
    await view().locator("section.q").nth(1).waitFor();
    assert.equal(await page.locator("#tally").textContent(), "0 of 2 settled");
    assert.equal(await tree().locator("li").count(), 2);

    // answer: accept one recommendation, write the other; both go to the agent and into grill.json
    await view().locator("section.q").nth(0).getByRole("button", { name: "Yes" }).click();
    await view().getByLabel("Your answer to Q2").fill("$150");
    assert.equal(await view().locator(".count").textContent(), "2 of 2 answered");
    await view().getByRole("button", { name: "Send answers" }).click();
    await page.locator("skillframe-chat .md", { hasText: "Q2 (Price): $150" }).waitFor();
    await idle();
    assert.deepEqual(grill().questions.map((q: any) => q.answer), ["Yes: The office manager", "$150"]);

    // the agent settles them and asks a question that hangs off Q1: it shows nested under Q1
    await call(url, "settle", { id: "Q1", decision: "The office manager buys it" });
    await call(url, "settle", { id: "Q2", decision: "$150 per office per month" });
    await call(url, "ask_round", { questions: [{ title: "How they pay", body: "Invoice or card?", recommended: "Invoice", parent: "Q1" }] });
    await view().getByRole("heading", { name: /Q3/ }).waitFor();
    assert.equal(await page.locator("#tally").textContent(), "2 of 3 settled");
    assert.equal(await tree().locator("li li").count(), 1);
    assert.match((await tree().locator("li li").textContent())!, /Q3 How they pay/);
    assert.match((await tree().locator("li").first().textContent())!, /The office manager buys it/);
    // only the branch that just arrived flashes, and nothing does when the page is opened again
    assert.deepEqual(await tree().locator("li.new > .node .t").allTextContents(), ["Q3 How they pay"]);
    await page.reload();
    await view().getByRole("heading", { name: /Q3/ }).waitFor();
    assert.equal(await tree().locator("li.new").count(), 0);

    await view().getByRole("button", { name: "Not sure" }).click();
    await view().getByRole("button", { name: "Send answers" }).click();
    await page.locator("skillframe-chat .md", { hasText: "Q3 (How they pay): Not sure" }).waitFor();
    await idle();

    // change an earlier answer from the tree
    await tree().getByRole("button", { name: /Q2 Price/ }).click();
    await view().getByLabel("Your answer").fill("$120");
    await view().getByRole("button", { name: "Change answer" }).click();
    await page.locator("skillframe-chat .md", { hasText: "I changed my answer to Q2 (Price) to: $120" }).waitFor();
    await idle();
    assert.equal(grill().questions[1].answer, "$120");

    // the summary, with a table, then the user's confirmation
    await call(url, "settle", { id: "Q3", decision: "Still open: invoice or card" });
    await call(url, "finish", { summary: "## Decisions\n\n| Question | Decision |\n|---|---|\n| Who buys it | The office manager |" });
    await view().locator(".summary table td", { hasText: "The office manager" }).waitFor();
    await view().getByRole("button", { name: "Confirm" }).click();
    await view().getByText("Confirmed", { exact: true }).waitFor();
    assert.equal(grill().confirmed, true);

    // nothing sticks out sideways, wide or narrow
    for (const width of [1280, 1000, 600]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px`);
    }
    await page.close();
  });

  test("a tool call with a question id that doesn't exist says which ids there are", async () => {
    const r = await call(url, "settle", { id: "Q99", decision: "x" }, "error");
    assert.match(r, /There is no question Q99/);
  });
});

describe("examples/studio", async () => {
  const browser = await launchBrowser();
  const home = tmpDir("studio");
  const site = path.join(home, "site");
  const other = path.join(home, "other");
  mkdirSync(site, { recursive: true });
  mkdirSync(path.join(other, "node_modules"), { recursive: true });
  let server: ChildProcess;
  let url: string;
  const state = async () => (await request(`${url}/studio/state`, "GET")).json;

  before(async () => {
    ({ server, url } = await start(path.join(EXAMPLES, "studio"), home, { PROJECT: site }));
  });

  after(async () => {
    await browser?.close();
    server?.kill();
  });

  /** resolves true if the preview tells its pages to reload within `ms` of `act()` */
  function reloads(preview: string, act: () => void, ms = 1500) {
    return new Promise<boolean>((resolve) => {
      const req = http.get(preview + "__studio/reload", (res) => {
        res.setEncoding("utf8");
        res.on("data", (d: string) => {
          if (d.includes("data: reload")) { clearTimeout(timer); req.destroy(); resolve(true); }
        });
        setTimeout(act, 100);
      });
      const timer = setTimeout(() => { req.destroy(); resolve(false); }, ms);
    });
  }

  test("the project's folder is served on a port of its own, with the studio's script in every page", async () => {
    const { project } = await state();
    assert.equal(project.folder, site);
    // an empty folder: a page saying so, still in standards mode (the script goes after the doctype)
    const empty = (await request(project.preview, "GET")).text;
    assert.match(empty, /^<!doctype html><script>/i);
    assert.match(empty, /no index\.html yet/);
    writeFileSync(path.join(site, "index.html"), "<!doctype html><html><head><title>T</title></head><body><p>hi</p></body></html>");
    const page = (await request(project.preview, "GET")).text;
    assert.match(page, /<head><script>[\s\S]*__studio\/reload[\s\S]*<\/script><title>T<\/title>/);
    // nothing outside the folder
    for (const p of ["..%2f..%2fpackage.json", "%2e%2e/%2e%2e/package.json"]) {
      assert.notEqual((await request(project.preview + p, "GET")).status, 200, p);
    }
    assert.equal((await request(project.preview + "missing.css", "GET")).status, 404);
  });

  test("a change in the folder reloads the page; one in node_modules or a dot folder doesn't", async () => {
    await request(`${url}/studio/open`, "POST", { folder: other });
    const { preview } = (await state()).project;
    assert.equal(await reloads(preview, () => writeFileSync(path.join(other, "node_modules", "x.js"), "1")), false);
    mkdirSync(path.join(other, ".claude"), { recursive: true });
    assert.equal(await reloads(preview, () => writeFileSync(path.join(other, ".claude", "x.json"), "{}")), false);
    assert.equal(await reloads(preview, () => writeFileSync(path.join(other, "style.css"), "p{}")), true);
    await request(`${url}/studio/open`, "POST", { folder: site });
  });

  test("opening something that isn't a folder says so, and keeps the project open", async () => {
    const r = await request(`${url}/studio/open`, "POST", { folder: path.join(home, "nope") });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /is not a folder/);
    assert.equal((await state()).project.folder, site);
    assert.deepEqual((await state()).recent.slice(0, 2), [site, other]);
  });

  test("in a Chinese browser, Studio's own controls are in Chinese", { skip: browser ? false : "no Chrome, Edge or Playwright Chromium on this machine" }, async () => {
    const page = await browser!.newPage({ viewport: { width: 1280, height: 800 }, locale: "zh-CN" });
    await page.goto(url + "/");
    await page.locator("#switch", { hasText: "换文件夹" }).waitFor();
    assert.equal(await page.locator("#reload").textContent(), "刷新");
    assert.equal(await page.locator("#start h1").textContent(), "打开一个项目");
    assert.equal(await page.locator("#folder").getAttribute("placeholder"), "粘贴文件夹路径，例如 E:\\Projects\\my-site");
    await page.close();
  });

  test("show_in_preview only takes addresses on this computer", async () => {
    assert.match(await call(url, "show_in_preview", { url: "https://example.com" }, "error"), /localhost/);
  });

  test("in the browser: the page runs beside the sidebar, its errors show up, and the agent can change what it shows", { skip: browser ? false : "no Chrome, Edge or Playwright Chromium on this machine" }, async () => {
    const page = await browser!.newPage({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
    page.setDefaultTimeout(10_000);
    await page.goto(url + "/");
    const view = page.frameLocator("#view");
    await view.getByText("hi").waitFor();
    assert.equal(await page.locator("#name").textContent(), "site");

    // a page that throws: the error is counted, listed, and gone once the page loads clean
    writeFileSync(path.join(site, "index.html"), "<!doctype html><html><head><title>T</title></head><body><p>broken</p><script>nothere()</script></body></html>");
    await view.getByText("broken").waitFor();
    await page.locator("#errors-btn", { hasText: "1 error" }).waitFor();
    await page.locator("#errors-btn").click();
    assert.match((await page.locator("#errors li").textContent())!, /nothere is not defined/);
    writeFileSync(path.join(site, "index.html"), "<!doctype html><html><head><title>T</title></head><body><p>fixed</p></body></html>");
    await view.getByText("fixed").waitFor();
    await page.locator("#errors-btn").waitFor({ state: "hidden" });

    // the agent points the main area at another page of the project
    writeFileSync(path.join(site, "about.html"), "<!doctype html><title>About</title><p>about us</p>");
    assert.match(await call(url, "show_in_preview", { url: "/about.html" }), /about\.html/);
    await view.getByText("about us").waitFor();
    assert.match(await page.locator("#address").inputValue(), /\/about\.html$/);

    // switching folders from the start screen
    await page.locator("#switch").click();
    await page.locator("#recent button", { hasText: "other" }).click();
    await page.locator("#name", { hasText: "other" }).waitFor();
    await view.getByText("no index.html yet").waitFor();

    for (const width of [1280, 900, 600]) {
      await page.setViewportSize({ width, height: 800 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px`);
    }
    await request(`${url}/studio/open`, "POST", { folder: site });
    await page.close();
  });
});
