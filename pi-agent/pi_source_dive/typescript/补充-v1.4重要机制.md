# 补充：读完前三章，再认识 v1.4 的几块新积木

本篇配合前三章阅读，固定到 Pi **v1.4.0 / `4a080252f06caf63a525d7873c5d94d3c23887e0`**。这里补主线里不适合展开的机制，不要求你先掌握全部 API。原教程作者：冬瓜；本次补充沿用文档 CC-BY-SA-4.0。

## 1. 系统提示词和工具，也成为对话历史的一部分

旧教程把一轮请求想成三份东西：`systemPrompt + messages + tools`。对外的 `Context` 仍支持这个简写，但内部已经统一成 transcript：system 消息也在 `messages` 中。

为什么要这样做？假设第一轮只能读文件，第二轮才启用写文件。如果只保存“现在有哪些工具”，回看第一轮就不知道模型当时能做什么。现在 system 消息可以记录工具增加 / 移除，以及提示词某个分节的替换：

```text
system：基础指令 + sections + 初始 toolsAdded
user：分析项目
assistant：调用 read
toolResult：文件内容
system：更新 rules 分节；增加另一个工具
user：继续
```

`SystemMessage.sections` 是按名称更新的分节，值为 `null` 表示删除；`toolsAdded` / `toolsRemoved` 描述工具变更。适配器根据自己的协议重放这些状态。运行时的 `context.tools` 另存真正可执行的函数，声明和实现并不是同一份东西。

源码：[SystemMessage / TranscriptContext](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/types.ts)、[normalizeContext 与状态重放](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/utils/transcript.ts)、[提示词分节](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/system-prompt.ts)。第 6、8、10 章后续会同步这个变化。

## 2. 轮次决策和“整件事结束”，是两个层次

第三章的三个钩子各有自己的时机：

```text
准备下一轮（首轮不走 prepareNextTurn）
  → turn_start → 追加待发消息 → prepareRequest
  → 模型响应 → 工具结果 → finishTurn → turn_end
  → 判断工具 / steering / followUp / 显式 continue
```

`finishTurn` 可以要求结束，也可以要求正常轮次再继续一次；error / aborted 仍硬停止。coding-agent 再用这些钩子做压缩、模型路由和扩展边界处理。扩展的 `turn_end` 等边界事件可以提交持久化变更，不能把它们都当成普通 UI 通知。

还有一个容易混淆的点：**`agent_end` 只结束一次底层 Loop，`agent_settled` 才表达产品层本次工作已经收尾。** 在前者之后，可能还有重试、压缩和排队输入。写 SSE 服务时，如果见到第一次 `agent_end` 就断开，可能漏掉后续输出。

`Agent.subscribe()` 会等待监听器 Promise；`session.subscribe()` 是外部同步通知，仍不等待异步监听器。两者都叫 subscribe，行为却不同。

源码：[AgentLoopConfig](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/agent/src/types.ts)、[Agent 生命周期](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/agent/src/agent.ts)、[AgentSession 事件与边界](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/agent-session.ts)。

## 3. MCP + codemode：工具多了，怎么避免一口气塞满上下文

v1.4.0 已能连接 MCP 的 stdio 或 streamable HTTP 服务。用户配置在 `~/.pi/agent/mcp.json`，项目配置在 `.pi/mcp.json`；项目资源受 trust 决策控制。旧文的“想用 MCP 就装扩展”已不是当前默认路径。

工具变多之后，另一个问题出现了：每次都把所有工具的完整 schema 发给模型，成本会很高。Pi 现在区分工具怎么被发现、怎么被调用：

| exposure | 怎么理解 |
|---|---|
| `direct` | 激活时向模型声明，也可被其他工具调用 |
| `model-only` | 给模型直接调用，其他工具不能间接调用 |
| `codemode` | 可由脚本调用，默认不直接向模型声明 |
| `deferred` | 可由脚本调用，描述也延迟发现，工具搜索可以找到 |
| `hidden` | 已注册但不可达，激活也不生效 |

`codemode` 让模型写一小段 JavaScript 来组合工具，例如先并行查两个文件，再把结果筛成几行返回。脚本中可用 `tools`、`text()`、`ALL_TOOLS`、`searchTools()` 等接口；`tool_search` 则帮助发现和加载需要的工具。**注册了工具，不等于每次请求都直接声明它的全部参数。**

工具可以声明 `outputSchema` 并返回 `structuredContent`，脚本因此能拿到结构化值；面向模型的文本 / 图片仍在 `content`。嵌套工具调用也要经过钩子，不能因为套了一层 codemode 就绕过拦截。

源码与用法：[MCP](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/mcp.md)、[codemode](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/codemode.md)、[ToolExposure / ToolDefinition](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/extensions/types.ts)、[runToolCall](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/agent/src/agent-loop.ts)。这部分后续与第 5、8 章衔接。

## 4. pi-durable：进程重启后，工作怎么接着做

普通 `Agent` 主要管理内存状态；coding-agent 另有自己的 JSONL 会话管理。如果要把输入、模型生成、工具效果和应用状态当作可恢复工作处理，v1.4.0 还提供了 **实验性的 `pi-durable`**。

它的入口是 `Harness.open()`，下层有 Session / Storage，任务通过提交与等待推进。官方说明强调先提交状态再向观察者展示；进程重启后按持久记录恢复。工具效果还要考虑“意图已写入，但执行结果未知”的恢复策略，不能盲目重做有副作用的操作。

这里有三条源码边界要记住：

- durable 依赖 pi-ai、chord、codemode 和 telemetry，不通过 agent-core 的旧 `harness/` 导出。
- coding-agent 当前并不直接依赖 durable；第 10 章的 SessionManager 仍要读自己的实现。
- durable 官方标注实验性。旧的 `SessionStorage` 示例不能直接替换包名就当作新版教程。

源码：[durable README](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/README.md)、[harness.ts](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/harness/harness.ts)、[types.ts](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/durable/src/types.ts)。先读完原来的 Loop 主线，再读这个包更容易分清职责。

## 5. 模型目录里，除了聊天模型还有什么

新的 Models / Provider 体系同时管理 `chat`、`image` 和 `classifier`。聊天模型用于 Agent 的流式对话；图像与分类模型有独立的调用契约，不能把它们直接塞给 Agent 的 `model` 字段。

v1.4.0 的分类输入还可带图片，但取决于具体模型能力。codemode 能调用分类和图像接口；它不把脚本变成另一层任意聊天模型调度器。

源码：[Models](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/models.ts)、[统一模型类型](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/types.ts)、[模型使用说明](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/models.md)。

## 6. 两个容易漏掉的工程细节

**输出截断不是正常工具调用。** 即使流式 JSON 的容错解析补出了一个对象，也可能少了文件内容或命令参数。v1.4.0 对 length 响应的所有调用返回错误结果，工具实际执行次数应为零。第三章的验证会专门检查这一点。

**项目 trust 不是每次工具调用的权限审批。** 它决定是否加载项目扩展、MCP 等资源；已启用的工具仍以进程本身的系统权限运行。扩展修改后用 `/reload` 重载，不能假定保存即生效。

源码：[截断保护](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/agent/src/agent-loop.ts)、[项目资源与运行边界](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/security.md)、[扩展重载](https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/docs/extensions.md)。
