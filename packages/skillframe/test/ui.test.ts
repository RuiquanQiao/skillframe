// The sidebar in a real browser (the Chrome or Edge already on the machine, headless), against
// fake agents: every card, the pickers, attachments, forks, and whether anything spills out of
// the sidebar at narrow and wide sizes, in light and dark.
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { createSkillframe, type Skillframe } from "../src/index.js";
import { fakeEnv, PKG, request, tmpDir } from "./helpers.js";

async function launch(): Promise<Browser | null> {
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try the next browser */
    }
  }
  return null;
}

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
  const browser = await launch();
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

  test("a new chat on another agent gets that agent's pickers (not only chats opened at load)", { skip: !browser }, async () => {
    const { page } = await open("codex");
    await say(page, "hello");
    await idle(page);
    await page.locator("skillframe-chat select.pick").selectOption("claude");
    await page.locator("skillframe-chat textarea[placeholder='Message Claude Code…']").waitFor();
    await page.locator("skillframe-chat select[aria-label='Model'] option[value='haiku']").waitFor({ state: "attached" });
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
