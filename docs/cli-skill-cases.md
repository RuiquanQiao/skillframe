# 把有名的命令行 skill 做成带界面的应用：候选清单

2026-11-02 · 乔睿泉（Ruiquan Qiao）· 项目：skillframe

这份清单为 `examples/` 挑例子：找几个很多人在用、但只能在终端里用的 agent skill，假装我们就是
skill 的作者，用 skillframe 给它加一个界面。这样做有三个目的：

1. 在真实形态的应用里找出 skillframe 自己的毛病（比如 sidebar 不显示表格）；
2. 给想这样做的 skill 作者一个照着抄的样板；
3. 给营销视频提供素材。

> **skill 是什么**：一个文件夹，里面有一份 `SKILL.md` 说明书（可能还附带脚本），告诉 Claude Code、
> Codex 这类 agent 怎么做某件事。用户在终端里跟 agent 对话，agent 读说明书干活，结果是终端里的
> 文字或硬盘上的文件，没有界面。

## 怎么挑的

- 看两个榜单：[skills.sh](https://skills.sh) 的安装数排行，以及 GitHub 上
  [claude-skills 话题](https://github.com/topics/claude-skills) 下按 star 排的仓库。数字都是
  2026-11-02 当天抓的。
- 只留**目前确实没有界面**的。已经自带界面的排除。
- 许可证要允许我们把 skill 的文字复制进 `examples/`（MIT、Apache 2.0 都行）。

## 排除的：已经有界面了

| skill | 热度 | 为什么排除 |
|---|---|---|
| [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)（把 HTML 动画渲染成 MP4） | 77.3k star；skills.sh 上 `hyperframes-cli` 140 万次安装 | 自带浏览器预览、Studio 编辑器和桌面应用 |
| [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser)（让 agent 操作浏览器） | 45.2k star；130 万次安装 | 有 `agent-browser dashboard`，网页里能看实时画面和操作记录 |
| [tt-a1i/archify](https://github.com/tt-a1i/archify)（把想法或代码画成图） | 92.5k star | 输出本身就是可交互的图 |

## 候选

### 1. grill-me：被 agent 连环追问，直到方案没有漏洞（推荐先做）

- **来源**：[mattpocock/skills](https://github.com/mattpocock/skills)，MIT 许可，309.4k star。
  `grill-me` 在 skills.sh 上有 150 万次安装，排第 2。
- **现在怎么用**：用户在终端里说"grill me on 我的方案"，agent 一个接一个地提问，直到方案的每个
  分支都定下来。问答全混在终端的滚动文字里，问到第 15 个问题时，前面答过什么、还剩哪些分支没定，
  都得往上翻着找。
- **做成界面后**：
  - 左边是"决策树"：每个问题一个节点，已定的打勾，没定的标灰，用户点任意节点能改答案；
  - 中间是随着回答长出来的方案文档；
  - 右边是 skillframe 的 sidebar，agent 在这里提问。
- **能测到 skillframe 的哪些部分**：提问卡片（用得最多）、agent 通过工具改应用数据、共享文件
  （方案文档 agent 和用户都能改）、长对话。
- **录视频的看点**：一棵树从一个节点长成十几个节点，全部打勾，最后得到一份完整的方案。不用解释，
  观众也看得懂。
- **代价**：最低。纯文字，不用装别的软件。

### 2. ad-creative：批量生成广告文案

- **来源**：[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)，
  MIT 许可，57.9k star。一共 53 个营销 skill，这台电脑上已经装了。
- **现在怎么用**：agent 在终端里一次吐出几十条标题和正文，用户要自己复制出来挑，再告诉 agent
  "第 3、7、12 条的方向再多写几条"。
- **做成界面后**：每条文案一张卡片，按平台排成网格（Google、Meta、LinkedIn，各平台有字数上限，
  超了标红）。用户点星收藏、点叉删掉，再说"照收藏的方向再来 10 条"。
- **能测到 skillframe 的哪些部分**：读取屏幕上下文（agent 知道用户收藏了哪几条）、一次回复里连续
  调用很多工具、表格（各版本对比）。
- **录视频的看点**：卡片一张张冒出来，用户划掉不要的，下一批明显更对味。
- **代价**：低。

### 3. pptx：做和改 PowerPoint

- **来源**：[anthropics/skills](https://github.com/anthropics/skills)，186.5k star。
- **现在怎么用**：agent 生成或修改 `.pptx` 文件，用户得自己用 PowerPoint 打开才能看到效果；
  改一处就要再开一次。
- **做成界面后**：左边实时显示每页幻灯片，用户点一页说"这页字太多"，agent 改完，预览自动刷新。
- **为什么排最后**：
  - 这个 skill 是 source-available，不是开源：可以看源码，但许可证不允许我们把它复制进仓库。
    例子只能要求用户自己去装。
  - 把 `.pptx` 渲染成图片要装 LibreOffice，多一个大依赖。

## 建议

先做 **grill-me**：代价最低，最能测到提问卡片，而且和你在别处做的 mediafarm 完全不是一类应用。
接着做 **ad-creative**，它会测到屏幕上下文和成批的工具调用。pptx 等前两个做完再说。

每个例子在 `examples/<名字>/` 下自带一份 README，第一段写清楚："这是模拟 skill 作者用 skillframe
给某个命令行 skill 加界面的例子，原 skill 来自哪里、用什么许可证。"

## 进度

- 2026-11-02：sidebar 原来不显示 Markdown 表格，已修好。
- 2026-11-02：grill-me 已做成 [examples/grill-me](../examples/grill-me)。用真的 Claude Code 跑了两轮：
  - 问题都通过 `ask_round` 放到了屏幕上，聊天里只回了两句话；
  - 用户的回答被 `settle` 成一句话的决定；
  - 第二轮的问题挂在对应的上一级决定下面。
