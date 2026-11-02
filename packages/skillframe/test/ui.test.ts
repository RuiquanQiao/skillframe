// The sidebar in a real browser (the Chrome or Edge already on the machine, headless), against
// fake agents: every card, the pickers, attachments, forks, and whether anything spills out of
// the sidebar at narrow and wide sizes, in light and dark.
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { Page } from "playwright-core";
import { createSkillframe, type Skillframe } from "../src/index.js";
import { fakeEnv, launchBrowser, PKG, request, tmpDir } from "./helpers.js";

/** everything in the sidebar that sticks out of it, and whether its transcript scrolls sideways */
async function spills(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector("skillframe-chat")!;
    const host = el.getBoundingClientRect();
    // inside a box that scrolls or clips (a code block), wide content is meant to scroll there
    const clipped = (n: Element) => {
      for (let p = n.parentElement; p; p = p.parentElement) if (getComputedStyle(p).overflowX !== "visible") return true;
      return false;
    };
    const out = [...el.shadowRoot!.querySelectorAll("*")]
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && (r.right > host.right + 1 || r.left < host.left - 1) && !clipped(n);
      })
      .map((n) => `${n.tagName.toLowerCase()}.${(n as HTMLElement).className}`);
    const log = el.shadowRoot!.querySelector(".log")!;
    return { out, sideways: log.scrollWidth > log.clientWidth + 1, page: document.documentElement.scrollWidth > innerWidth };
  });
}

describe("the sidebar in a browser", async () => {
  const browser = await launchBrowser();
  let sf: Skillframe;
  let url: string;

  before(async () => {
    const dir = tmpDir("ui");
    sf = createSkillframe({
      appName: "UI Test",
      agents: ["claude", "codex"],
      workspace: path.join(dir, "ws"),
      dataDir: path.join(dir, "data"),
      static: path.join(PKG, "test/fixtures/ui"),
      env: fakeEnv(),
      tools: { add_note: { description: "Add a note", input: { text: "string" }, run: (a) => `Added ${a.text}` } },
    });
    url = (await sf.listen()).url.replace(/\/$/, "");
  });

  after(async () => {
    await browser?.close();
    await sf?.close();
  });

  /** a page showing a fresh chat of `agent` */
  async function open(agent = "claude", size = { width: 420, height: 760 }) {
    const id = (await request(`${url}/sf/chats`, "POST", { agent })).json.id as string;
    const page = await browser!.newPage({ viewport: size });
    page.setDefaultTimeout(10_000);
    await page.goto(url + "/");
    // the sidebar opens the most recently updated chat, and an earlier test's chat can still be
    // updated as its agent exits: once the first load is done, open this one by its id
    await page.waitForFunction(() => !!(document.querySelector("skillframe-chat") as any)?.state?.meta);
    await page.evaluate((chatId) => (document.querySelector("skillframe-chat") as any).open(chatId), id);
    await page.locator(`skillframe-chat textarea[placeholder="Message ${agent === "claude" ? "Claude Code" : "Codex"}…"]`).waitFor();
    return { page, id };
  }

  async function say(page: Page, text: string) {
    const box = page.locator("skillframe-chat textarea");
    await box.fill(text);
    await box.press("Enter");
  }

  const idle = (page: Page) => page.locator("skillframe-chat button.send", { hasText: "Send" }).waitFor();

  test("skips with a reason when no browser is installed", { skip: browser ? false : "no Chrome, Edge or Playwright Chromium on this machine" }, () => {});

  test("long replies fit the sidebar at 320 px and 800 px, light and dark", { skip: !browser }, async () => {
    const { page } = await open("claude", { width: 320, height: 700 });
    await say(page, "long");
    await page.locator("skillframe-chat .md", { hasText: "Here:" }).waitFor();
    await idle(page);
    for (const width of [320, 800]) {
      for (const colorScheme of ["light", "dark"] as const) {
        await page.setViewportSize({ width, height: 700 });
        await page.emulateMedia({ colorScheme });
        const s = await spills(page);
        assert.deepEqual(s, { out: [], sideways: false, page: false }, `${width}px ${colorScheme}`);
      }
    }
    await page.close();
  });

  test("a markdown table shows as a table, and a wide one scrolls inside the reply", { skip: !browser }, async () => {
    const { page } = await open("claude", { width: 320, height: 700 });
    await say(page, "table");
    await page.locator("skillframe-chat .md", { hasText: "After the table." }).waitFor();
    await idle(page);
    const t = await page.evaluate(() => {
      const md = [...document.querySelector("skillframe-chat")!.shadowRoot!.querySelectorAll(".md")].find((n) => n.textContent!.includes("After the table."))!;
      const table = md.querySelector("table");
      return {
        before: md.querySelector("p")?.textContent,
        head: [...(table?.querySelectorAll("th") ?? [])].map((c) => [c.textContent, (c as HTMLElement).style.textAlign]),
        rows: [...(table?.querySelectorAll("tbody tr") ?? [])].map((r) => [...r.children].map((c) => c.innerHTML)),
        pipes: md.textContent!.includes("|---"),
      };
    });
    assert.equal(t.before, "三个赛道的评分：");
    assert.deepEqual(t.head, [["赛道", "left"], ["自动化", "right"], ["风险", "center"]]);
    assert.deepEqual(t.rows[0], ["AI 朗读 <code>reddit</code> 故事", "90", "<strong>高</strong>"]);
    assert.deepEqual(t.rows[1], ["a | b", "65", "低"]);
    assert.equal(t.rows.length, 3);
    assert.equal(t.pipes, false);
    for (const width of [320, 800]) {
      await page.setViewportSize({ width, height: 700 });
      assert.deepEqual(await spills(page), { out: [], sideways: false, page: false }, `${width}px`);
    }
    await page.close();
  });

  test("permission card: Allow goes to the agent and the card settles", { skip: !browser }, async () => {
    const { page } = await open();
    await say(page, "perm");
    const card = page.locator("skillframe-chat .ask:not(.settled)");
    await card.getByText("Claude Code wants to use Write").waitFor();
    await card.getByRole("button", { name: "Allow", exact: true }).click();
    await page.locator("skillframe-chat .ask.settled", { hasText: "Allowed" }).waitFor();
    await page.locator("skillframe-chat .md", { hasText: /^allowed$/ }).waitFor();
    await page.close();
  });

  test("question card: the picked option is the answer", { skip: !browser }, async () => {
    const { page } = await open();
    await say(page, "question");
    const card = page.locator("skillframe-chat .ask:not(.settled)");
    const send = card.getByRole("button", { name: "Send answers" });
    assert.equal(await send.isDisabled(), true);
    await card.getByRole("button", { name: /Blue/ }).click();
    await send.click();
    await page.locator("skillframe-chat .md", { hasText: 'answered: {"Which color?":"Blue"}' }).waitFor();
    await page.close();
  });

  test("plan card: approving switches to accepting edits", { skip: !browser }, async () => {
    const { page } = await open();
    await say(page, "plan");
    const card = page.locator("skillframe-chat .ask:not(.settled)");
    await card.locator("strong", { hasText: "milk" }).waitFor(); // the plan's markdown is drawn
    await card.getByRole("button", { name: "Approve and start" }).click();
    await page.locator("skillframe-chat .md", { hasText: "approved: acceptEdits" }).waitFor();
    await page.close();
  });

  test("New chat then an immediate agent pick: the new chat gets that agent, no extra chat", { skip: !browser }, async () => {
    const { page } = await open("claude");
    await say(page, "hello");
    await idle(page);
    const before = (await request(`${url}/sf/chats`, "GET")).json.chats.length;
    // in this order, in the same instant: the pick lands while the new chat is still being made
    await page.evaluate(() => {
      const root = document.querySelector("skillframe-chat")!.shadowRoot!;
      (root.querySelector(".bar button.ghost") as HTMLButtonElement).click();
      const pick = root.querySelector("select.pick") as HTMLSelectElement;
      pick.value = "codex";
      pick.dispatchEvent(new Event("change"));
    });
    await page.locator("skillframe-chat textarea[placeholder='Message Codex…']").waitFor();
    await page.waitForTimeout(300);
    const chats = (await request(`${url}/sf/chats`, "GET")).json.chats;
    const current = await page.evaluate(() => (document.querySelector("skillframe-chat") as any).state.meta);
    assert.equal(chats.length, before + 1, `exactly one new chat: ${JSON.stringify(chats.map((c: any) => [c.agent, c.title]))}`);
    assert.equal(current.agent, "codex", JSON.stringify(current));
    assert.equal(chats.find((c: any) => c.id === current.id).agent, "codex");
    assert.equal(await page.locator("skillframe-chat .note", { hasText: "stays with" }).count(), 0);
    await page.close();
  });

  test("a step the user opened stays open when the reply is redrawn", { skip: !browser }, async () => {
    const { page } = await open();
    await say(page, 'tool {"text":"a"}');
    await idle(page);
    const step = page.locator("skillframe-chat details.step").first();
    await step.locator("summary").click();
    assert.equal(await step.getAttribute("open"), "");
    await say(page, "hello");
    await page.locator("skillframe-chat .md", { hasText: /^Hi there$/ }).waitFor();
    await idle(page);
    assert.equal(await page.locator("skillframe-chat details.step").first().getAttribute("open"), "");
    await page.close();
  });

  test("attach an image: a chip, then the agent gets it as an image", { skip: !browser }, async () => {
    const { page } = await open();
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
    await page.locator("skillframe-chat input[type=file]").setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: png });
    await page.locator("skillframe-chat .box .chip", { hasText: "dot.png" }).waitFor();
    await say(page, "images?");
    await page.locator("skillframe-chat .md", { hasText: "text,image:image/png:true" }).waitFor();
    assert.equal(await page.locator("skillframe-chat .box .chip").count(), 0, "sent attachments leave the box");
    await page.locator("skillframe-chat .user .chip", { hasText: "dot.png" }).waitFor();
    await page.close();
  });

  test("the agent's task list shows above the message box", { skip: !browser }, async () => {
    const { page } = await open();
    await say(page, "todo");
    await page.locator("skillframe-chat .tasks summary", { hasText: "Tasks: 1 of 2 done" }).waitFor();
    await page.locator("skillframe-chat .tasks li.in_progress", { hasText: "Add milk" }).waitFor();
    await page.close();
  });

  test("the mode and model pickers set the chat's next replies", { skip: !browser }, async () => {
    const { page, id } = await open();
    await page.locator("skillframe-chat select[aria-label='Permission mode']").selectOption("plan");
    await page.locator("skillframe-chat select[aria-label='Model']").selectOption("haiku");
    await page.waitForTimeout(200);
    const meta = (await request(`${url}/sf/chats/${id}`, "GET")).json.meta;
    assert.deepEqual([meta.mode, meta.model], ["plan", "haiku"]);
    await page.close();
  });

  test("in Chinese, the built-in agents' modes and sign-in hint are in Chinese too", { skip: !browser }, async () => {
    const { page } = await open();
    await page.locator("skillframe-chat select[aria-label='Permission mode'] option[value='plan']").waitFor({ state: "attached" });
    const shown = await page.evaluate(() => {
      const el = document.querySelector("skillframe-chat") as any;
      el.setAttribute("lang", "zh");
      el.state.app.agents.find((a: any) => a.id === "claude").signedIn = false; // as on a machine where it isn't
      el.render();
      const root = el.shadowRoot;
      const plan = root.querySelector("select option[value='plan']");
      return { mode: plan.textContent, desc: plan.title, empty: root.querySelector(".empty").textContent };
    });
    assert.deepEqual([shown.mode, shown.desc], ["先出计划", "只读；先提出计划，你批准后再动手"]);
    assert.match(shown.empty, /看起来还没登录。打开终端，运行 claude/);
    await page.setViewportSize({ width: 320, height: 700 });
    assert.deepEqual(await spills(page), { out: [], sideways: false, page: false });
    await page.close();
  });

  test("before the app's details arrive, the top bar shows no stray text", { skip: !browser }, async () => {
    const { page } = await open();
    const bar = await page.evaluate(() => {
      const el = document.querySelector("skillframe-chat") as any;
      el.state.app = null; // as in the first moments after the page loads
      el.renderBar();
      return el.shadowRoot.querySelector(".bar").textContent;
    });
    assert.doesNotMatch(bar, /null|undefined/);
    await page.close();
  });

  test("a new chat on another agent gets that agent's pickers (not only chats opened at load)", { skip: !browser }, async () => {
    const { page } = await open("codex");
    await say(page, "hello");
    await idle(page);
    await page.locator("skillframe-chat select.pick").selectOption("claude");
    await page.locator("skillframe-chat textarea[placeholder='Message Claude Code…']").waitFor();
    await page.locator("skillframe-chat select[aria-label='Model'] option[value='haiku']").waitFor({ state: "attached" });
    await page.close();
  });

  test("a refresh that lands after the user switched chats doesn't switch them back", { skip: !browser }, async () => {
    const { page } = await open("codex");
    await say(page, "hello");
    await idle(page);
    const shown = await page.evaluate(async () => {
      const chat = document.querySelector("skillframe-chat") as any;
      // the quiet refresh a finished reply starts, answered only after the user picks another agent
      const api = chat.api.bind(chat);
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));
      chat.api = async (method: string, p: string, body?: unknown) => {
        const r = await api(method, p, body);
        if (method === "GET" && p.startsWith("/chats/")) await held;
        return r;
      };
      const refresh = chat.open(chat.state.chatId, true);
      await chat.pickAgent("claude");
      release();
      await refresh;
      chat.api = api;
      return chat.state.meta.agent;
    });
    assert.equal(shown, "claude");
    await page.close();
  });

  test("fork from an earlier reply opens a new chat with the conversation up to there", { skip: !browser }, async () => {
    const { page } = await open();
    await say(page, "hello");
    await idle(page);
    await say(page, "args");
    await idle(page);
    const first = page.locator("skillframe-chat .reply").first();
    await first.hover();
    await first.getByRole("button", { name: "Fork from here" }).click();
    await page.locator("skillframe-chat .bar select:not(.pick) option:checked", { hasText: "(fork)" }).waitFor({ state: "attached" });
    assert.equal(await page.locator("skillframe-chat .user").count(), 1);
    await page.close();
  });
});
