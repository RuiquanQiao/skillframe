// md(), the sidebar's Markdown, in plain Node: no browser, so these run on every machine.
import assert from "node:assert/strict";
import path from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let md: (src: string) => string;

before(async () => {
  // the module defines the <skillframe-chat> element when it loads; md() itself needs no DOM
  const g = globalThis as any;
  g.HTMLElement ??= class {};
  g.customElements ??= { get: () => undefined, define: () => {} };
  ({ md } = await import(pathToFileURL(path.join(PKG, "ui/skillframe-chat.js")).href));
});

const TBL = (head: string, body: string) => `<div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;

describe("md() tables", () => {
  test("a plain table", () => {
    assert.equal(md("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"), TBL("<th>a</th><th>b</th>", "<tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr>"));
  });

  test("the leading and trailing | are optional", () => {
    const want = TBL("<th>a</th><th>b</th>", "<tr><td>1</td><td>2</td></tr>");
    assert.equal(md("a | b\n--- | ---\n1 | 2"), want);
    assert.equal(md("| a | b\n|---|---\n| 1 | 2"), want);
    assert.equal(md("a | b |\n---|---|\n1 | 2 |"), want);
  });

  test("column alignment from the colons", () => {
    const html = md("| l | c | r | n |\n|:--|:-:|--:|---|\n| 1 | 2 | 3 | 4 |");
    assert.match(html, /<th style="text-align:left">l<\/th><th style="text-align:center">c<\/th><th style="text-align:right">r<\/th><th>n<\/th>/);
    assert.match(html, /<td style="text-align:left">1<\/td><td style="text-align:center">2<\/td><td style="text-align:right">3<\/td><td>4<\/td>/);
  });

  test("cells keep bold, code and links, and are escaped", () => {
    const html = md("| x | y |\n|---|---|\n| **bold** `co|de` | [site](https://example.com) <b> |");
    assert.match(html, /<td><strong>bold<\/strong> <code>co\|de<\/code><\/td>/);
    assert.match(html, /<td><a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">site<\/a> &lt;b&gt;<\/td>/);
  });

  test("an escaped \\| stays in its cell", () => {
    assert.match(md("| a | b |\n|---|---|\n| x \\| y | 2 |"), /<td>x \| y<\/td><td>2<\/td>/);
  });

  test("short rows are filled and long rows cut to the header's width", () => {
    assert.match(md("| a | b |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |"), /<tbody><tr><td>1<\/td><td><\/td><\/tr><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody>/);
  });

  test("text before and after a table, with or without blank lines", () => {
    const html = md("Scores:\n| a | b |\n|---|---|\n| 1 | 2 |\nAfter the table.\n\nNext paragraph.");
    assert.equal(html, "<p>Scores:</p>" + TBL("<th>a</th><th>b</th>", "<tr><td>1</td><td>2</td></tr>") + "<p>After the table.</p><p>Next paragraph.</p>");
  });

  test("two tables in one reply", () => {
    assert.equal((md("| a |\n|---|\n| 1 |\n\n| b |\n|---|\n| 2 |").match(/<table>/g) ?? []).length, 2);
  });

  test("a | inside a code block does not start a table", () => {
    const html = md("```sh\nls | grep x\n---|---\n| a | b |\n```");
    assert.doesNotMatch(html, /<table>/);
    assert.equal(html, "<pre><code>ls | grep x\n---|---\n| a | b |</code></pre>");
  });

  test("a | inside inline code does not start a table", () => {
    const html = md("Run `a | b` then\n---|---");
    assert.doesNotMatch(html, /<table>/);
  });

  test("table-like lines with no separator row stay text", () => {
    const html = md("| a | b |\n| 1 | 2 |");
    assert.doesNotMatch(html, /<table>/);
    assert.equal(html, "<p>| a | b |<br>| 1 | 2 |</p>");
  });

  test("a separator row with a different column count is not a table", () => {
    assert.doesNotMatch(md("| a | b | c |\n|---|---|\n| 1 | 2 | 3 |"), /<table>/);
    assert.doesNotMatch(md("a | b\n---"), /<table>/);
  });

  test("empty and odd input", () => {
    assert.equal(md(""), "");
    assert.doesNotMatch(md("|\n|"), /<table>/);
    assert.doesNotMatch(md("|\n|---|"), /<table>/);
  });
});
