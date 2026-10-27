# 第1章：开篇 —— 为什么 Pi-Agent 值得你花时间

> 本文是「Pi-Agent 项目原理详解」的开篇。不涉及源码细节，而是回答一个更根本的问题：Pi 是什么？它为什么值得你花时间？读完这篇，你会对 Pi 的三个身份——**编码工具、学习教材、开发 SDK**——有一个清晰的全局认知。

> **修订基线**：Pi v1.4.0（2026-10-27 核对，[固定源码](https://github.com/earendil-works/pi/tree/4a080252f06caf63a525d7873c5d94d3c23887e0)）。本轮更新第 1–3 章；其余章节的差异与后续安排见[版本审计](版本审计与更新方案.md)。原作者：冬瓜；修订沿用原许可证。

---

## 一、开场：三个问题，一个答案

你可能因为三种不同的原因点开了这个系列：

1. **"我想找个好用的编码 Agent"** — 你受够了臃肿的工具，想要一个极简、透明、快的东西
2. **"我想知道 Agent 到底怎么做的"** — 你翻过一些 Agent 框架的源码，要么太复杂（几万行起跳），要么太简陋（一个 while 循环就敢叫 Agent）
3. **"我要做自己的 Agent"** — 你有垂直场景的需求，需要基于 SDK 做二次开发，不想从零造轮子

这三个问题，恰好对应 Pi 的三个身份。而这三个身份指向同一个项目，这本身就值得好奇。

在深入源码之前，我们先站远一点，看看 Pi 的全貌。

---

## 二、Pi 是什么：一张图看懂

### 一句话定义

**Pi 是一款极简、可扩展的终端编码 Agent 外壳（coding agent harness），由 libGDX 作者 Mario Zechner 创建，核心用 TypeScript 编写，MIT 协议开源。**

拆开来看：

- **"编码 Agent"** — 它能读懂你的代码库，写代码、改代码、跑命令，像一个坐在你旁边的结对编程伙伴
- **"终端外壳"** — 它住在终端里，没有 GUI，没有 IDE 插件，输出写进终端回滚缓冲区。这决定了它的一切后续设计选择
- **"极简"** — 默认启用 read / write / edit / bash，提示词按工具、项目规范、技能等分节组装。它仍把子 Agent、计划模式等交给扩展；v1.4.0 已有 MCP 和 codemode，不能再用“没有 MCP”概括它
- **"可扩展"** — 极简核心之上的缺失功能，通过 TypeScript 扩展、技能、Pi Package 来补充

### 关键数字

| 指标 | 数值 | 含义 |
|------|------|------|
| 源码版本 | v1.4.0 | 固定到发布标签对应的 commit，便于复现 |
| 文件与命令工具 | 8 种，默认启用其中 4 种 | read / write / edit / bash，加 powershell / grep / find / ls；另有 MCP、codemode 等工具机制 |
| 系统提示词 | 按分节动态构建 | 字数取决于启用工具、项目上下文与技能，不再写成固定预算 |
| TUI | 独立终端 UI 库 | 差分渲染、组件与终端适配，核心入口为 `packages/tui/src/tui.ts` |
| 支持供应商 | 40+ 个内置 provider 标识 | `KnownProvider` 有 42 项，包含区域与套餐变体；不等于 42 个独立品牌 |
| 学习主线 | 4 个包 | pi-ai / pi-agent-core / pi-tui / pi-coding-agent；全仓库还有其他包 |
| 运行模式 | 4 种 | 交互 / print-JSON / RPC / SDK |

> **核对入口**：[工具清单](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/tools/index.ts)、[模型类型](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/types.ts)、[提示词构建](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/system-prompt.ts)。Stars、排行榜和代码行数会变，这里不把它们当作架构依据。

### 四个学习主线包，各司其职

```
┌──────────────────────────────────────────┐
│          pi-coding-agent                 │  ← 完整 CLI 产品 + SDK
│  系统提示词 · 内置工具 · 会话管理 · 扩展  │
├──────────────────────────────────────────┤
│  pi-tui              │  pi-agent-core    │  ← 终端 UI + Agent 引擎
│  差分渲染 · 组件系统  │  AgentLoop · 工具 │
│                      │  系统 · 事件流    │
├──────────────────────┴───────────────────┤
│              pi-ai                       │  ← 多供应商 LLM 抽象
│  统一 API · 上下文交接 · 流式 · Token 追踪│
└──────────────────────────────────────────┘
```

这四个包里，`pi-ai / pi-agent-core / pi-coding-agent` 构成一条**三层堆栈**（每层可独立使用），`pi-tui` 是一个**正交的 UI 库**，与 Agent 体系完全解耦——你可以只用 `pi-ai` 调模型，也可以用 `pi-agent-core` 在你自己的应用里跑 Agent Loop，完全不需要碰 CLI。这是 Pi 作为 SDK 的核心价值，我们在第五节细讲。

![Pi-Agent 三层主线与独立 UI 库](assets/261027-ch01-four-layer-architecture.svg)

**配图说明**：四个主线包的分工图。coding-agent 在顶层（产品+SDK），agent-core 在中层（循环、状态、事件），pi-ai 在底层（模型抽象），pi-tui 是平行的 UI 库。会话持久化和压缩由 coding-agent 组织；其他包见下一章。

> v1.4.0 已无旧的 `pi-orchestrator` workspace。MCP、codemode，以及另一套 `pi-durable` 持久运行时，见[新版机制补充](补充-v1.4重要机制.md)。

---

## 三、视角一：作为编码 Agent —— 一个好用的日常工具

### 3.1 Pi 是什么：积木，而非整车

先用一句话把 Pi 的位置说清楚：**Pi 不是又一个 Cursor 或 Claude Code——它是一盒让你按自己心意拼出自己 CodingAgent 的积木**。

打个比方。Cursor 像一辆造好的整车——座椅、空调、导航都装好了，你坐进去就能开。Claude Code 也是一辆整车，只是配了赛车引擎和强化悬挂。Pi 不一样——它给你的是发动机、底盘、转向柱、电路系统，外加一份"我们已经帮你验证过这套组合能跑"的保证。它自带一个能直接开的默认配置（你 `pi` 一回车就启动了），但它的核心价值在于：你可以把这套零件拆开、重组、加料、换皮，造一辆**完全按你工作流定制的车**。

这个定位是 Pi 一切设计决策的源头。理解了它，下面几件事就都说得通了：

- 为什么系统提示词可以替换和按节调整？因为"该说什么"应该由你决定
- 为什么默认工具从 read / write / edit / bash 起步？因为工具组合应该能按场景调整
- 为什么计划模式 / 子 Agent 等仍留给扩展？因为你可以自己决定工作流；MCP 则已是内置能力

社区观察者 Pasquale 把这个分野说得最锋利：

> "像 Claude Code 和 Codex CLI 这类工具，优化的是'在精心打磨的环境里尽快拿到第一次成功'…… Pi 把优先级挪到了'对工具的所有权'上。它不给你计划模式，它给你**构造一个完全按你心意行事的计划模式所需的构建块**。"

这不是说 Pi "不能开箱即用"——它完全能。`pi` 一回车，你就在和一个能干的编码 Agent 对话了。但 Pi 的"好用"，本质上不是它做加法做出来的，而是它**做减法之后把所有加法的权力留给你**。一位社区观察者把它叫作"世上最可驾驭（steerable）的外壳"——可驾驭，不是因为它响应快、而是因为你对它每一个动作都有否决权和改造权。

**适用人群判断**：如果你生活在终端里、熟悉 tmux 和容器、对每一个关不掉的功能都烦躁——Pi 是你的工具。如果你要的是零配置开箱即用、最小配置跑起来——选 Cursor 或 Claude Code。这不是优劣问题，是工作方式契合度的问题。

### 3.2 五根定制杠杆：Pi 没有的功能，全都可以自己造

§3.1 说过 Pi 把计划模式、子 Agent、待办等工作流留给扩展——你可能要问：这些能力我想要怎么办？

答案就在 §3.1 那句"它不给你计划模式，它给你**构造计划模式所需的构建块**"。Pi 给你**五根杠杆**来把它塑形成你想要的形状——前四根用于自己用，第五根用于把成果分享出去。**这五根杠杆本身才是 Pi 真正的能力所在**：极简的核心 + 强大的杠杆，让你拿到的是"一个能长成任何形状的 Agent"，而不是"一个被作者决定了长成什么形状的 Agent"。

**扩展（Extensions）——最被低估、也是最强的一根杠杆**

扩展是 TypeScript 文件，Pi 会发现并加载它们。改完后运行 `/reload`，可以在同一会话里重载扩展、技能和模板。它催生了一种独特的玩法：**让编码 Agent 自己改自己的能力**。注意，“支持重载”不等于“保存文件就立即生效”。

扩展能碰的东西很深：工具、斜杠命令、键盘快捷键、事件钩子、整套 TUI 组件树——换句话说，**Pi 不藏私，把内脏都暴露给你了**。

关键是：**计划模式、子 Agent、审批流程等，都可以用扩展来组合**。官方仓库的 [examples/extensions](https://github.com/earendil-works/pi/tree/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/examples/extensions) 有对应示例。MCP 则直接配置 `mcp.json`；如果想在一轮结束后继续工作，新版提供了完成轮次的决策钩子，第三章会展开。

更狠的是——**如果官方扩展没满足你，你可以自己写一个完全按你需求的**。Mario 描述过一个例子：有人五分钟写了一套 read、write、edit、bash，通过 SSH 操作远程机器——彻底替换掉了内置工具。如果你想给 Pi 加一个权限审批弹窗（毕竟默认 YOLO），约 50 行扩展代码就够了。如果你想 fork 出一套完全不同的 UI（比如把 Agent 跑在浏览器里、用 React 重画界面），也办得到。**Pi 的能力，随你愿意定制它的意愿而线性增长**。

**技能（Skills）——按需加载的能力包**

技能是"指令 + 资源"打包的能力包，采用**渐进式披露**——名称、描述和路径进入系统提示词，全文按需读取。它解决一个核心矛盾：你既想要丰富的能力库、又不想每个会话都为用不上的全文付上下文税。

技能和扩展的关系可以这样理解：扩展是给 Agent **加新能力**（加新工具、加新命令、加新模式），技能是给 Agent **加新知识**（"遇到 X 任务该怎么做"）。两者可以叠加——一个扩展可以注册若干技能，一个技能也可以调用扩展提供的工具。

**提示词模板（Prompt Templates）——可复用的工作流**

针对重复性任务的可复用 markdown 模板，支持参数。比如你天天做 code review，可以写一个模板把"读 diff、检查风格、给反馈"的指令固化下来。需要时通过斜杠命令一键加载。

**主题（Themes）——可实时重载的 TUI 皮肤**

TUI 的图形主题。在会话进行中切换，立即生效。这是杠杆里最轻的一根，但对长期使用者来说很重要——你要看一个工具一整天，它得让你眼睛舒服。

**Pi 包（Pi Packages）——把上面四样打包分发**

扩展、技能、模板、主题都可以打包成一个 Pi 包，从 npm 或 git 安装：

```bash
pi install npm:@foo/pi-tools
# 或者直接从 git 仓库
pi install git:github.com/user/repo
```

这套模型和开发者每天都在用的包管理器高度相似——这种熟悉感是它被快速采纳的原因之一。**你写好一个扩展，发到 npm 上，全世界任何 Pi 用户一行命令就能装上**。这把"自己造"的范围从"自己用"扩展到了"社区共享"。

> 注：扩展与事件监听的写法，[实战上手篇](../../pi_sdk_learn/docs/第6章-事件监听-实现你的个性化需求.md)第 6 章会专门展开；技能、模板、主题、Pi 包等机制可查阅 pi 官方文档。本节只是让你先建立"Pi 是可塑的、且缺什么都能自己补"这个心智。

### 3.3 它带来的日常红利：默认配置就很好用

讲完了"Pi 是积木"，回到最实际的问题：那 Pi 这盒积木**按默认配置拼出来**之后，作为一个日常编码工具，体验怎么样？答案：好得令人吃惊。

Pi 默认提供了一套可以直接工作的编码工具，也保留了调整工具、模型与交互方式的接口。理解它的日常体验，可以从下面几件具体的事入手。

下面是默认配置下你立刻能享受到的几个红利：

**上下文怎么组成，能看得见**。系统提示词、工具声明、项目规范和技能清单都有源码入口。上下文窗口是 Agent 最稀缺的资源——固定指令占得越少，留给代码的空间就越多。`SYSTEM.md` 可以替换默认提示词前缀；项目规范、技能等分节仍会按配置加入，不应把它理解为清空整份最终提示词。

**透明到骨头里**。你能看到模型收到的每一条消息、每一次工具调用的完整输入输出、跨会话的完整成本追踪、会话的 HTML/JSON 导出。用过其他编码 Agent 的人大概都经历过：Agent 做了个奇怪决定，你想知道它为什么这样做，但你看不到它"看到"了什么。在 Pi 里没有这种黑箱。

**模型自由（40+ provider 标识）**。Pi 内置 Anthropic、OpenAI、Google、Bedrock、DeepSeek、智谱、Kimi、MiniMax 等适配，也允许自定义兼容接口。更重要的是**会话中途切换模型**——用 `/model` 或默认快捷键 `Ctrl+L`。比如用 Claude 做复杂推理、切到 MiniMax 做简单文本处理省钱。`pi-ai` 在底层处理跨供应商的消息和工具调用转换；不同模型的思考内容和签名不保证无损交接。

**树状会话：走错路就分叉**。Pi 用 `parentId` 把会话条目组织成**树结构**，在 JSONL 文件中追加记录。`/tree` 跳到历史节点、从那里分叉出新分支继续探索。同一会话的分支保存在同一个文件里。调试时尤其有用——你可以在同一个起点尝试三种不同的修复方案，不必担心"回不去了"。

**YOLO 模式与安全哲学**。Pi 默认 YOLO——Agent 不经审批弹窗直接执行动作。Mario 的论点是：基于审批的安全措施会让用户疲劳（"弹窗疲劳"），最终要么被整体禁用、要么沦为看都不看就机械点同意的"安全表演（security theater）"。他建议把容器化作为安全边界。如果你确实需要审批流程，约 50 行扩展代码可以自己实现——框架提供了所有钩子。

### 3.4 上手一分钟

```bash
# Node.js >= 22.19；固定版本，和本教程对应
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.4.0
```

然后在任意项目目录里运行 `pi`。设一个 `ANTHROPIC_API_KEY` 环境变量，或者用 `/login` 完成认证，就可以开始了。

### 3.5 不靠环境变量：用 `models.json` 定义第三方模型

DeepSeek、智谱、Kimi 等已有内置 provider，通常可以先用 `/login` 或对应环境变量配置认证。如果要接自己的网关或目录里没有的模型，就还需要告诉 Pi：base URL 在哪、用哪种协议、模型 ID 叫什么。

Pi 的解法是一个本地 JSON 配置文件：`~/.pi/agent/models.json`（Windows 下是用户目录里的 `.pi\agent\models.json`）。默认由 [ModelRuntime.create()](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/model-runtime.ts#L218) 通过 `ModelConfig.load()` 读取，不需要额外的命令行参数。

**一个自定义网关的配置示意**（地址和模型名需要换成服务实际提供的值）：

```json
{
  "providers": {
    "example-gateway": {
      "baseUrl": "https://api.example.com/v1",
      "api": "openai-completions",
      "apiKey": "EXAMPLE_API_KEY",
      "models": [
        { "id": "your-chat-model", "name": "我的网关模型" }
      ]
    }
  }
}
```

拆开看几个关键字段：

- **`providers`** — 顶层是 provider 字典，键名（`example-gateway`）是你自己起的名字，会作为模型的 `provider` 字段显示
- **`api`** — 选协议。最常见的是 `openai-completions`（OpenAI 兼容接口，国内厂商几乎都支持）、`anthropic-messages`、`openai-responses`。这个字段决定了 Pi 用哪种请求格式去调
- **`baseUrl`** — provider 的接口地址
- **`apiKey`** — 这里写环境变量名 `EXAMPLE_API_KEY`，运行时解析。配置也支持字面值和命令解析；个人凭据不要写进仓库
- **`models`** — 该 provider 下的模型列表。`id` 是调 API 时传的真实模型名，`name` 是 TUI 里显示的友好名
- **`contextWindow` / `maxTokens`** — 可选，告诉 Pi 这个模型的窗口和最大输出长度，影响上下文压缩策略

**配置完之后怎么用？** 三种方式：

1. **临时切换**：会话中按 `/model` 或 `Ctrl+L`，列出所有已加载模型（包括你刚配的）fuzzy 搜索选一个
2. **设为默认**：编辑 `~/.pi/agent/settings.json`，加上 `"defaultProvider": "example-gateway"` 和 `"defaultModel": "your-chat-model"`，启动 Pi 就直接用它
3. **命令行查列表**：`pi models`（或 `pi models example-gateway` 做 fuzzy 过滤）—— 出错时会显示 `models.json` 的解析错误，方便排查

models.json 还支持两种进阶用法（本教程不展开）：用 `modelOverrides` 给**内置 provider** 的某个具体模型打补丁；用 `compat` 字段处理接口兼容性问题。完整配置见[官方模型配置说明](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/models.md)，实现见 [model-config.ts](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/model-config.ts)。

---

## 四、视角二：作为学习素材 —— Agent 设计的教科书

第二个身份：Pi 是学习"怎么构建一个生产级 Agent"的绝佳教材。

### 4.1 为什么是 Pi？——因为它足够小

很多 Agent 框架动辄几万行代码，光是搞清楚启动流程就要读几十个文件。Pi 的核心循环集中在 `packages/agent/src/agent-loop.ts`，可以先读懂调度，再按需追进工具执行和模型适配；不必一开始读完整个仓库。

**这意味着你可以在有限的时间内真正"读完"一个高质量 Agent 的全部核心代码。** 这种事对 Claude Code 来说是不可能的，对 LangChain 也是不可能的。

### 4.2 本教程会讲什么

本教程（插图版）目前已发布 **10 章**，前 6 章建立核心理解，后 4 章进入进阶工程议题：

| 章节 | 主题 | 核心问题 | 难度 |
|------|------|----------|------|
| 第 1 章 | 开篇总览 | Pi 是什么？为什么值得学？ | 入门 |
| 第 2 章 | 项目结构与分层架构 | 四个包怎么分工？为什么这样分层？ | 入门 |
| 第 3 章 | Agent Loop | 怎么让 LLM 反复思考和行动？ | ★ 核心 |
| 第 4 章 | 模型调用 | 怎么用一套代码调 30+ 家模型？ | ★ 核心 |
| 第 5 章 | 工具系统 | 工具怎么定义、验证、执行？ | ★ 核心 |
| 第 6 章 | 消息系统 | 对话历史怎么表示和传递？ | ★ 核心 |
| 第 7 章 | 事件驱动架构 | 为什么需要事件？ | 进阶 |
| 第 8 章 | 上下文工程 | 怎么让有限窗口装下无限对话？ | 进阶 |
| 第 9 章 | 上下文压缩 | 对话太长怎么办？ | 进阶 |
| 第 10 章 | 会话管理 | 会话怎么存、怎么恢复、怎么分叉？ | 进阶 |

> **内容范围**：原教程共 10 章。本次先将第 1–3 章更新到 v1.4.0，第 4–10 章和实战篇仍待升级；请结合[版本审计](版本审计与更新方案.md)阅读，暂不要照抄后续章节的旧 API 示例。

> **阅读建议**：前 6 章建议按顺序通读，它们是理解 Pi-Agent 运行机制的基础。第 7 章起可按需跳读，每章相对独立。

每一个章节都会回答三个层次的问题：**是什么**（概念）、**怎么做**（源码分析）、**为什么这样做**（设计取舍）。

### 4.3 Pi 的"减法哲学"：真正的教育在取舍里

看一个"什么都做了"的框架，你只能学到"他们做了什么"。看一个刻意什么都不做的框架，你才能学到"做 Agent 到底需要什么"。

Pi 早期的 "What we didn't build" 强调取舍。版本演进后边界也会变化——MCP 已内置，下面保留的则是目前仍主要交给用户和扩展选择的工作流：

| Pi 不做的 | 为什么不做 | 替代方案 |
|-----------|-----------|----------|
| 子 Agent | 增加复杂度，降低可观察性 | tmux 多实例，或专用扩展 |
| 权限弹窗 | 导致"弹窗疲劳"，沦为安全表演 | 容器化隔离，或用扩展搭审批流程 |
| 计划模式 | 计划写到 markdown 文件里更持久、可复用 | 写 plan.md 文件 |
| 后台 bash | tmux 已经解决了这个问题 | 用 tmux |
| 内置待办 | TODO.md 文件更灵活 | 用 markdown 文件或自建扩展 |

这些取舍是理解 Pi 设计哲学的关键，也是学习 Agent 设计时最有价值的思考素材。

---

## 五、视角三：作为 SDK —— 构建你自己的 Agent

第三个身份：Pi 是一套可以独立复用的 SDK，让你在它的基础上构建自己的 Agent 应用。

### 5.1 SDK 堆栈：三层架构 + 一个正交的 UI 库

回看第二节四个包的分工图，你会发现 `pi-tui` 是和 `pi-agent-core` **并排**画的——它不在堆栈链上，而是 coding-agent 用来展示交互界面的"侧依赖"。所以从 SDK 复用角度，Pi 实际是一条**三层堆栈**（`pi-ai → pi-agent-core → pi-coding-agent`），加上一个**正交的终端 UI 库**（`pi-tui`）。堆栈三层每层都可独立使用，UI 库也可独立使用——但它解决的是与 Agent 无关的另一类问题。

**Layer 1: `pi-ai` — 只管调模型**

```typescript
import { createModels, type Context } from '@earendil-works/pi-ai';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel('anthropic', 'claude-sonnet-4-6');
if (!model) throw new Error('模型不在当前目录中');
// Context 是 interface（不是 class），用对象字面量构造
const context: Context = {
  systemPrompt: 'You are helpful.',
  messages: [{ role: 'user', content: 'Hello!', timestamp: Date.now() }],
};

// stream() 返回事件流；complete() 则直接 await 拿到最终 AssistantMessage
const eventStream = models.stream(model, context);
for await (const event of eventStream) {
  if (event.type === 'text_delta') process.stdout.write(event.delta);
}
```

`pi-ai` 不依赖任何 Agent 概念。你可以在任何需要调 LLM 的项目里用它——聊天机器人、文档分析、代码审查工具、甚至和 Agent 完全无关的应用。它支持 30+ 供应商、流式输出、跨供应商上下文交接、token 成本追踪、以及浏览器端运行。

**Layer 2: `pi-agent-core` — 只管跑循环**

```typescript
// 沿用上一段的 models 和 model；AgentOptions 接收 initialState 与 streamFn
import { Agent } from '@earendil-works/pi-agent-core';

const agent = new Agent({
  initialState: { model, systemPrompt: 'You are helpful.', tools: [] },
  streamFn: models.streamSimple.bind(models), // 绑定实例，保留方法使用的 this
});

agent.subscribe((event) => {
  if (event.type === 'turn_end') console.log('完成一轮');
});
await agent.prompt('Hello!');
```

`pi-agent-core` 依赖 `pi-ai`，但不依赖 `pi-coding-agent` 或 `pi-tui`。你可以用它构建任意类型的 Agent——不限于编码场景。数据分析 Agent、客服 Agent、自动化测试 Agent——只要是需要"模型思考 → 调工具 → 看结果 → 再思考"循环的场景，都可以用。

**Layer 3: `pi-coding-agent` — 完整的 CLI + SDK**

这是堆栈的最顶层，把下面两层组装成一个完整的编码 Agent 产品。同时也暴露出 SDK 接口，让你以"无头"（headless）模式在自己的应用中嵌入 Agent：

```typescript
import { createAgentSession } from '@earendil-works/pi-coding-agent';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';

const { session } = await createAgentSession({
  cwd: process.cwd(),
  model: getBuiltinModel('anthropic', 'claude-sonnet-4-6'),
});

// subscribe 接收一个监听器函数，事件类型是 AgentSessionEvent 联合类型
try {
  session.subscribe((event) => {
    if (event.type === 'turn_end') console.log('Agent 完成了一轮思考');
  });
  await session.prompt('Read the codebase and explain the architecture.');
} finally {
  session.dispose();
}
```

**侧库: `pi-tui` — 一个与 Agent 无关的终端 UI 库**

把 `pi-tui` 单独拿出来说，是因为它有个特别的属性：**独立于 Pi 的 Agent 体系**。它的 [package.json](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/tui/package.json) 有 `get-east-asian-width`、`marked` 和 `marked-cjk-friendly` 三个运行时依赖，不依赖 Pi 的 AI 包。反倒是 coding-agent 单向依赖它，比如 [list-models.ts](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/cli/list-models.ts) 从 pi-tui 引入 `fuzzyFilter`。

`pi-tui` 是 Mario 的老本行（libGDX 游戏引擎作者）的作品，它实现了：

- **差分渲染** —— 每帧只重绘变化的单元格，基本无闪烁
- **保留模式 UI** —— 类似 React 的声明式组件系统，而非 ncurses 那种命令式
- **内置组件** —— 带自动补全的输入框、markdown 渲染器、语法高亮、模糊搜索

**它有什么用？** 跟 Agent 没关系——任何需要终端交互界面的 Node.js 程序都能用：CLI 工具、交互式 dashboard、TUI 游戏、自定义 REPL。如果你曾经觉得 blessed/ink 要么太重要么太抽象，pi-tui 是一个值得读源码的极简替代品。

**为什么会出现在 Pi 里？** 因为 Pi 选择"终端外壳"形态（见第二节），就必须自己解决终端渲染问题。Mario 没用任何现成 TUI 库，而是按游戏引擎的思路重写了一个。这个"副产物"反而成了 Pi 最容易脱离 Pi 单独复用的部分——它根本不在乎你是在调 LLM 还是在做别的事。

### 5.2 扩展系统：让 Agent 修改自己的能力

Pi 的扩展系统支持通过 **`/reload` 重载**——当 Agent 修改了扩展文件，可以在同一会话中重新加载。这催生了一种强大的模式：**可以让编码 Agent 来修改和增强自己的能力。**

扩展可以实现：
- **自定义工具** — 定义新的 tool，带 TypeBox schema 参数校验
- **UI 组件** — 在终端里嵌入自定义界面
- **斜杠命令** — 注册新的 `/` 命令
- **事件监听** — 在工具调用、turn 结束等时机插入逻辑
- **主题** — 定制 TUI 外观
- **提示词模板** — 可复用的 prompt 片段

这五种定制杠杆（扩展、技能、提示词模板、主题、Pi Package），本质上提供了**从"用 Pi"到"改造 Pi"的平滑升级路径**。

### 5.3 四种运行模式

| 模式 | 用途 | 示例 |
|------|------|------|
| 交互模式 | 日常编程的经典 TUI | `pi` |
| print/JSON 模式 | 脚本和 CI/CD 流水线 | `pi -p "explain this code"` |
| RPC 模式 | 通过 stdin/stdout 交换 JSON | 集成进非 Node.js 程序 |
| SDK 模式 | 嵌入自己的应用 | `createAgentSession()` |

这种多模式设计意味着 Pi 可以从"开发者手边的工具"无缝演进为"生产系统中 Agent 能力的提供者"——你不需要在项目成长后换一套框架。

### 5.4 开源项目已经在用

OpenClaw 等项目已经在生产环境中使用 Pi 的 SDK，把每一个 Agent 实例跑在 Pi 上。Pi Package 可以通过 npm 或 git 分发，生态正在形成。

---

## 六、Pi 的对立面：两种相反的哲学

理解 Pi 最好的方式，是看它的对立面。

**Claude Code** 代表"全包"路线：内置计划模式、子 Agent、MCP、权限弹窗、待办追踪——一艘功能齐全的"飞船"。系统提示词数万字，功能持续膨胀，用户被推送着适应工具。

**Everything Claude Code** 则把这种哲学推向另一端：把现成命令和 Agent 打包在一起，用户从"满"开始，慢慢删。

**Pi 代表相反的轨迹：从"空"开始，让你来填。** 核心极简，扩展随心。工具适应你的工作流，而不是强迫你适应工具的设计。

这两种哲学没有绝对的对错。但如果你是一个"想知道 Agent 到底在干什么"的人，Pi 大概率更适合你。

---

## 七、总结

Pi 是一个"三位一体"的项目：

1. **作为工具**：一个极简、透明、可驾驭的终端编码 Agent。上下文干净、模型自由、树状会话、YOLO 默认——适合想要完全掌控自己工具的开发者
2. **作为教材**：一个高质量、可读完的 Agent 设计参考。10 章内容覆盖 Agent 架构的核心决策点（从 Agent Loop 到会话管理），每一行代码都有"为什么这样做"的答案
3. **作为 SDK**：一套层次分明、可独立复用的开发套件。三层堆栈（`pi-ai → pi-agent-core → pi-coding-agent`）每层都能单独使用，外加一个与 Agent 解耦的 `pi-tui` 终端 UI 库；四种运行模式覆盖从本地到生产的所有场景

但最重要的是，Pi 证明了**做减法是一种有竞争力的产品立场**。在一个正朝着"全包"狂奔的赛道里，"我不需要的，就不会被构建"这句话本身，就是一项真正的功能。

---

> ### 版本说明
>
> 本章由原 v0.80.2 教程修订到 **v1.4.0**，源码固定为 `4a080252f06caf63a525d7873c5d94d3c23887e0`。必要示例的核对方式、逐章改动和未更新范围见[版本审计与更新方案](版本审计与更新方案.md)。
