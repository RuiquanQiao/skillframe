# Grill Me

This example shows what a skill author could do with skillframe: take a skill that only works in
a terminal and give it a screen of its own.

The skill is `grilling` from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT
License), the one behind `/grill-me`. It interviews you about an idea in rounds until every
decision is made. In a terminal, each round is a long block of text, and by round three the
earlier answers have scrolled away. Here:

- each round of questions appears as a form, with the agent's recommended answer and one-click
  choices;
- your decisions grow into a design tree beside it, and you can click any branch to change an
  answer;
- at the end the agent writes the shared understanding for you to confirm.

```
npm run grill        (from the repository root, after npm install)
```

Then open the address it prints. You need Claude Code, Codex or Qwen Code installed and signed in.

## What changed from the terminal skill

Only a few lines of [skill/SKILL.md](skill/SKILL.md). The interview itself is Matt Pocock's,
word for word. The changed part tells the agent to put questions on the screen through the app's
tools instead of printing them:

| Tool | What the agent does with it |
|---|---|
| `ask_round` | puts the next round of questions on the screen, each with its recommended answer, choices, and the question it hangs off |
| `settle` | records the decision an answer makes, in one sentence; the branch in the tree turns green |
| `finish` | shows the shared understanding for the user to confirm |
| `get_grill` | reads the whole tree back |

Everything is kept in one file, `workspace/grill.json`. The page and the agent both read and write
it, and skillframe tells the page when it changes. `server.js` is 141 lines and
`public/index.html` 327.

## Files

- `server.js`: the tools, and what the agent is told about the screen with each message
- `public/index.html`: the start screen, the round form, the design tree and the summary
- `skill/SKILL.md`: the adapted skill, copied into `workspace/.claude/skills/grilling/` on start
- `workspace/` and `.data/` are created on first run and are not in git
