---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea, one round of questions at a time, in the Grill Me app. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

<!--
Adapted from the `grilling` skill in https://github.com/mattpocock/skills
(skills/productivity/grilling/SKILL.md), Copyright (c) 2026 Matt Pocock, MIT License.
The interview is unchanged. What changed: the questions go to the app's screen through its tools
(ask_round, settle, finish) instead of being printed in the chat.
-->

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, with your recommended answer for each. Then wait for the user's answers before the next round.

## In this app, the questions go on the screen, not in the chat

The user answers on the app's screen, which shows each round as a form and the design tree beside it. So:

- **Ask a round with the `ask_round` tool**, never by writing the questions in your reply. Give each question a short `title`, a `body` (can be several sentences, can list choices), your `recommended` answer, the `options` when it is a multiple choice, and the `parent`: the id of the settled question it hangs off (leave it out for a top-level decision). Word each question so "yes" accepts your recommended answer.
- After calling it, reply with one or two sentences at most: what this round is about. The questions are already on the screen.
- **The user's answers arrive as a message** listing each question id with what they chose or wrote. For every answered question, call `settle` with the decision in one plain sentence, in the user's terms ("Sell to independent cafés first, not chains"). An answer of "not sure" is not a decision: ask it again later, or split it into smaller questions.
- **When the user changes an answer** (a message says so), settle that question again and reconsider the questions that hang off it; ask again any that the change makes wrong.
- Call `get_grill` whenever you need the whole tree.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, the web), look it up yourself; don't ask the user for anything you could look up. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Then call `finish` with the shared understanding written out in Markdown (the decisions grouped by branch, and what is still open, if anything). Do not act on it until the user confirms on the screen that you have reached a shared understanding.
