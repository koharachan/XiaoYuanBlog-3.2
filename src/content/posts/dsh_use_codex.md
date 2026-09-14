# 修复 DSH 与 Codex 反代的“隐形战争”：真正出问题的不是模型，而是协议语义

最近在折腾 DeepSeek Shell（DSH）接 OpenAI Responses / Codex 风格的反向代理时，我遇到了一组非常有迷惑性的错误：

```text
invalid justification: expected a non-empty sentence

sandbox escalation to "danger-full-access"
is not strictly wider than this call's current "danger-full-access" mode

model "gpt-6-astra" does not declare image input
```

单看这些错误，很容易得出几个错误结论：

模型是不是不会调用工具？

Prompt 是不是没写好？

`gpt-6-astra` 是不是其实不支持图片？

或者我的 `danger-full-access` 根本没生效？

真正把整条链路拆开以后，我发现这些问题其实来自同一个根源：

**模型看到的“能力世界”，和程序真正能够接受的“运行世界”，没有完全对齐。**

换句话说，这并不是单纯的模型问题，而是一场发生在：

**DSH 工具定义 → Pi 适配层 → OpenAI Responses 协议 → Codex/反代 → DSH 运行时验证**

之间的协议语义错位。

更有意思的是，这次问题大部分不需要改源码。

最终真正改变系统行为的核心配置只有：

```yaml
compat:
  supportsStrictMode: true
```

以及：

```yaml
input: [text, image]
```

但如果只记住这两行配置，而不知道为什么它们有效，下一次换一个代理、换一个版本，很可能还会踩坑。

所以这篇文章不只记录“怎么修”，而是试着把整个问题背后的协议链路讲清楚。

---

## 一、先别怀疑模型：模型只是按照它看到的 Tool Schema 行事

最初最诡异的现象，是模型调用 `bash`、`write`、`edit` 等工具时，总喜欢带上：

```json
{
  "sandbox_permissions": "danger-full-access",
  "justification": ""
}
```

但当前会话本来就已经运行在：

```text
danger-full-access
```

而且工具说明里明确表达了一个原则：

> 没有必要的参数应该省略。

理论上模型完全没有理由再次申请 `danger-full-access`。

更没有理由生成一个空的 `justification`。

可它偏偏一直这么做。

这时最重要的排查思路不是继续改 Prompt，而是问一个问题：

**模型究竟看到了什么工具定义？**

因为模型调用工具时，并不是在“理解你的 TypeScript 代码”。

它真正看到的是最终发送给 API 的 Tool Schema。

只要中间任何一层改变了这个 Schema，模型眼中的工具就已经不是你源码里定义的那个工具了。

这也是整件事情最关键的切入点。

---

# 二、第一层真相：在 DSH 源码里，这两个字段本来就是可选的

先看 DSH 自己。

`dsh-tool-bash` 的工具参数大致是：

```javascript
parameters: {
  command: {
    type: "string",
    required: true
  },

  description: {
    type: "string",
    required: true
  },

  timeoutMs: {
    type: "number"
  },

  workdir: {
    type: "string"
  },

  sandbox_permissions: {
    type: "string",
    enum: [...]
  },

  justification: {
    type: "string"
  }
}
```

这里真正明确标记 `required: true` 的，是：

```text
command
description
```

而不是：

```text
sandbox_permissions
justification
```

附件里的源码排查也确认了这一点：这两个权限升级参数只是条件性暴露，并没有被 DSH 原始工具定义声明成必填。

当前 DSH 源码同样保留了这个设计：`sandbox_permissions` 和 `justification` 都是 TypeScript 层面的可选字段；真正执行时才额外验证两者必须成对出现，并且 `justification` 必须是非空的有效说明。

所以这里可以先排除一个嫌疑：

**不是 DSH 原始 Schema 主动要求模型每次都发送 justification。**

问题发生在后面。

---

# 三、真正容易出问题的地方，是 Pi 的 OpenAI Responses 兼容层

DSH 并不会把内部 Tool Schema 原封不动地塞给所有模型提供商。

中间还有一层非常重要的组件：

```text
@earendil-works/pi-ai
```

它负责把统一工具定义转换成 OpenAI、Anthropic、Google 等不同 API 能理解的格式。

而对自定义 OpenAI Responses provider，有一个关键能力位：

```yaml
compat:
  supportsStrictMode: ...
```

Pi 当前文档明确把它列为 `openai-responses` 的兼容能力配置，并且当前实现对自定义 Responses provider 的默认值是：

```text
supportsStrictMode = false
```

这意味着，如果你的配置只是：

```yaml
api: openai-responses
baseURL: https://example.com/
```

但没有声明：

```yaml
compat:
  supportsStrictMode: true
```

Pi 会认为：

> 这个兼容端点不一定认识 function tool 上面的 `strict` 字段，所以保险起见，不发送。

于是最终可能产生：

```json
{
  "type": "function",
  "name": "bash",
  "parameters": {
    ...
  }
}
```

注意：

**这里没有 `strict`。**

这就是第一个协议分叉点。

---

# 四、一个很容易被源码误导的细节：为什么有地方写默认 true，实际却是 false？

这里还有一个非常值得记录的源码细节。

如果直接打开 Pi 的：

```text
openai-responses-shared.ts
```

会看到：

```javascript
const supportsStrictMode =
  options?.supportsStrictMode ?? true;
```

乍一看似乎应该得出：

> Pi 默认支持 Strict Mode。

这也是排查过程中最容易混淆的地方。

但继续往上一层看 `openai-responses.ts`，会发现真正处理模型兼容配置的是：

```javascript
function getCompat(model) {
  return {
    ...
    supportsStrictMode:
      model.compat?.supportsStrictMode ?? false
  };
}
```

然后这个明确的 `false` 会被传进：

```text
convertResponsesTools()
```

所以两段代码并不矛盾。

它们只是位于不同层。

直接调用转换函数时，它自己的默认值是 `true`；但标准 `openai-responses` provider 路径会先把自定义 provider 的兼容能力解析成 `false`，再显式传进去。

这也解释了为什么：

**你可能在某一段源码里看到 `?? true`，最终抓包却发现根本没有 `strict`。**

排查 Agent 协议时，这类“局部默认值”和“最终有效默认值”的差异非常常见。

真正应该相信的永远是：

```text
最终出站请求
```

而不是某一个中间函数。

---

# 五、最微妙的问题：`strict` 缺省到底意味着什么？

这是这次问题里最值得深入研究的部分。

早期 OpenAI Structured Outputs 的公开说明，是通过：

```json
"strict": true
```

显式启用严格 Schema 约束。

但到了当前 Responses API，事情已经没有那么简单。

OpenAI 当前 Responses 文档中的示例，发送 function tool 时甚至可以不显式写 `strict`，而返回的工具定义已经被归一化成：

```json
"strict": true
```

换句话说：

**“省略 strict 等价于什么”本身就是一个会随着 API 版本、端点和兼容实现变化的语义。**

这点非常重要。

因此，我现在不太愿意把这次问题简单总结成：

> “Codex 看到没有 strict，就一定默认 strict=true。”

这个说法太绝对。

更准确的说法应该是：

> **DSH/Pi 与目标 OpenAI-compatible 反代，对于“strict 字段缺省”的理解发生了不一致。**

对于一个真正完全兼容某一版 OpenAI Responses API 的端点，也许缺省值有清晰定义。

但现实中的“OpenAI Compatible API”可能是：

```text
客户端
   ↓
Pi
   ↓
反向代理
   ↓
协议转换器
   ↓
Codex backend
   ↓
模型
```

其中任何一层都可能：

```text
补默认值
删除字段
转换 JSON Schema
升级协议版本
重新生成工具定义
```

所以在兼容层设计中有一个非常实用的原则：

**能显式表达的协议语义，就不要依赖“字段缺失”的隐含意义。**

这也是：

```yaml
supportsStrictMode: true
```

真正重要的原因。

---

# 六、为什么 `supportsStrictMode: true` 反而会让工具“不严格”？

这个配置名字第一次看很容易误解。

```yaml
supportsStrictMode: true
```

并不等于：

```text
启用严格模式
```

它真正表达的是：

> 这个 provider 能理解工具定义中的 `strict` 字段，所以 Pi 可以把这个字段发出去。

而对于普通 DSH 工具，没有主动申请 constrained sampling 时，Pi 的转换逻辑默认是：

```javascript
defaultStrict = false
```

于是最终工具会变成：

```json
{
  "type": "function",
  "name": "bash",
  "parameters": {
    ...
  },
  "strict": false
}
```

也就是说：

```text
supportsStrictMode: true
             ↓
允许发送 strict
             ↓
当前工具 strict 默认值 = false
             ↓
最终显式发送 strict:false
```

这也是为什么看似有点反直觉的一行配置，最终反而关闭了严格工具约束。

附件中的实测修复正是如此：加入 `supportsStrictMode: true` 后，实际出站工具 Schema 包含 `"strict": false`。

---

# 七、Strict Mode 为什么特别容易把“可选字段”变成坑？

Pi 当前确实实现了一套 Strict JSON Schema 转换器。

它做的事情之一，是把原本：

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string"
    },
    "justification": {
      "type": "string"
    }
  },
  "required": [
    "command"
  ]
}
```

转换成严格 Schema 时类似：

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string"
    },
    "justification": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "command",
    "justification"
  ],
  "additionalProperties": false
}
```

换句话说：

原来的：

```text
字段可以不存在
```

变成：

```text
字段必须存在，但可以是 null
```

Pi 当前 `makeJsonSchemaNodeStrict()` 的源码就是这么处理的：遍历所有 property，把原来的可选属性包装成 nullable，最后把所有属性名写进 `required`，并设置 `additionalProperties = false`。

附件中的源码分析也记录了相同的行为。

这里的问题在于：

```text
null
```

和：

```text
""
```

完全不是一回事。

DSH 对 escalation 参数还有自己的业务层验证：

```text
justification 必须是一个非空说明
```

于是如果模型被某一层 Schema 或训练习惯诱导，生成了：

```json
"justification": ""
```

它虽然满足：

```text
JSON 类型是 string
```

却不满足：

```text
DSH 业务语义
```

最终就会得到：

```text
invalid justification:
expected a non-empty sentence
```

这就是一个非常典型的：

**Schema 合法 ≠ 业务合法。**

---

# 八、但这里还要纠正一个细节：strict=false 并不会自动删除 sandbox_permissions

这是原稿里我认为最应该补充的一点。

加入：

```yaml
supportsStrictMode: true
```

之后确实大幅减少了空 `justification` 和无意义参数。

但它并没有从 DSH 工具中真正删除：

```text
sandbox_permissions
justification
```

只要当前执行器声明自己支持 sandbox escalation，这两个字段仍可能出现在模型看到的 bash Tool Schema 中。

DSH 官方当前文档明确说明：

当 sandbox executor 存在时，bash 工具会向模型暴露 `sandbox_permissions` 和 `justification`；模型只有在真实 sandbox denial 后，才应该带着这两个参数重试。

所以 `strict:false` 做的是：

> 不再因为结构约束迫使模型提供这些字段。

它没有做到：

> 模型永远看不到这些字段。

两者差别很大。

因此这次配置修改应该叫：

**协议兼容修复 / 行为缓解。**

而不是：

**彻底修复 sandbox escalation Schema。**

---

# 九、为什么已经 danger-full-access，还会收到“无法升级”？

现在来看第二个错误：

```text
sandbox escalation to "danger-full-access"
is not strictly wider than this call's current
"danger-full-access" mode
```

它实际上是完全符合 DSH 当前设计的。

DSH 的权限阶梯大致是：

```text
read-only
   ↓
workspace-write
   ↓
danger-full-access
```

`danger-full-access` 已经是最高级。

所以：

```text
danger-full-access
→ danger-full-access
```

并不是 escalation。

它没有扩大任何权限。

当前 DSH 文档也明确要求：

> escalation 必须 strictly wider。

真正的问题不是这个校验错了。

问题是：

**模型仍然能够看到一个在当前状态下没有合法取值的升级入口。**

于是就形成了：

```text
当前权限 = danger-full-access

工具仍暴露：
sandbox_permissions:
  workspace-write | danger-full-access

模型看到：
“这里有权限参数”

模型生成：
danger-full-access

运行时判断：
你已经是 danger-full-access

结果：
拒绝
```

这属于典型的：

**静态 Tool Schema 与动态运行状态没有完全同步。**

附件报告同样定位到：`danger-full-access` 没有更宽模式，但升级字段仍可能暴露。

而且这已经不是孤立现象。

DSH 社区近期也出现了多起几乎完全相同的报告：Full Access 会话中，模型重复发送相同的 `sandbox_permissions`，最终触发 `not strictly wider`；甚至有人提出把“same-mode escalation”改成幂等 no-op，而不是硬错误。

从架构上看，更彻底的修复应该发生在 DSH 自身：

要么根据当前 effective sandbox mode 动态裁剪 Tool Schema；

要么把“申请当前已经拥有的权限”处理成幂等操作；

而不是让每一种模型都靠 Prompt 学会“千万别传这个参数”。

---

# 十、第三个问题更简单：模型会不会看图，DSH 看的是配置，不是模型名字

再来看：

```text
model "gpt-6-astra"
does not declare image input
```

这个问题其实与模型推理能力关系不大。

Agent 框架不会看到一个模型名字叫：

```text
gpt-6-astra
```

就自动猜测：

> Astra 听起来很高级，应该支持图片。

它需要确定的 capability metadata。

Pi 的模型定义里明确存在：

```typescript
input: ("text" | "image")[]
```

DSH 在处理图片时，也会检查当前路由的：

```text
inputModalities
```

只有包含：

```text
image
```

才允许把图片真正送给模型。

附件中的源码定位显示，如果 `inputModalities` 不存在，或者其中没有 `"image"`，DSH 会直接抛出：

```text
does not declare image input
```

所以自定义模型如果只配置：

```yaml
- id: gpt-6-astra
  name: GPT-6 Astra
```

DSH 并不知道它是否支持图片。

正确做法是明确声明：

```yaml
- id: gpt-6-astra
  name: GPT-6 Astra
  input: [text, image]
```

这行配置的真正含义不是：

> 开启 Astra 的视觉能力。

而是：

> **告诉 Agent 路由系统，这条模型链路允许接受图片输入。**

这两个概念一定要区分。

如果底层真实模型或者你的反代其实不支持 image，那么加上：

```yaml
input: [text, image]
```

只会让 DSH 第一层能力检查放行。

请求最终仍然会在下游失败。

所以能力声明必须和真实后端保持一致。

这就是：

**capability metadata 是契约，不是 feature flag。**

---

# 十一、最终的最小化配置

对于这次实际环境，最终配置可以保持得非常简单：

```yaml
llm-pi-ai:
  providers:
    kemeu:
      displayName: kemeu
      apiKeyEnv: KEMEU_API_KEY
      api: openai-responses
      baseURL: https://kemeu.cn/

      compat:
        supportsStrictMode: true

      models:
        - id: gpt-6-astra
          name: GPT-6 Astra
          input: [text, image]
```

它解决两个完全不同层面的问题。

第一处：

```yaml
compat:
  supportsStrictMode: true
```

解决的是：

```text
Pi ↔ OpenAI-compatible proxy
```

之间的协议能力声明。

它允许 Pi 显式发送：

```json
"strict": false
```

而不是依赖 `strict` 缺省时的隐含语义。

第二处：

```yaml
input: [text, image]
```

解决的是：

```text
DSH ↔ Model Route
```

之间的能力声明。

它告诉 DSH：

```text
这条路由接受 image。
```

附件里的实际配置和验证结果也证明，这两个修改分别让出站工具获得 `strict:false`，并让 `gpt-6-astra` 的输入能力包含 `"image"`。

---

# 十二、还有一个版本差异：openai-responses 和 openai-codex-responses 不是一回事

深入看 Pi 当前实现后，还有一个值得额外提醒的坑。

普通：

```yaml
api: openai-responses
```

和 Pi 自己的：

```text
openai-codex-responses
```

并不是完全相同的兼容策略。

当前普通 `openai-responses` 对未知 provider 默认：

```text
supportsStrictMode = false
```

而 Codex Responses 实现则默认：

```text
supportsStrictMode = true
```

并且 Codex 路径在转换工具时会传：

```javascript
strict: null
```

这意味着：

今天在：

```text
openai-responses + Codex 兼容反代
```

上验证有效的配置逻辑，

并不能机械复制到：

```text
openai-codex-responses
```

然后期待请求 JSON 完全一样。

名称看起来相似，但适配层不是同一套默认值。

这也是为什么排查反代问题时，第一件事情应该确认：

```text
DSH 最终走的 api adapter 到底是哪一个？
```

而不仅仅是问：

```text
后端是不是 Codex？
```

---

# 十三、怎样验证这类修复，而不是“感觉它好了”？

我现在更推荐把验证拆成四层，而不是只重新聊两句看看模型还报不报错。

```text
第一层：配置层

确认解析后的 provider：
supportsStrictMode == true

确认模型：
input == ["text", "image"]


第二层：序列化层

抓最终 Tool Schema。

重点检查：
strict: false

同时确认 required 里只有真正必填的字段。


第三层：能力层

实际发送一张图片。

不要只证明 DSH 不再拦截，
还要确认反代和底层模型确实成功接收 image。


第四层：执行层

在 danger-full-access 会话执行普通 bash/write。

理想调用应该直接省略：
sandbox_permissions
justification
```

附件报告中的验证实际上已经覆盖了这几层：配置读取正常、模拟工具序列化得到 `strict:false`、图片 capability 检查通过，随后 DSH 进程重新加载了配置。

这里还有一个小的版本提醒。

本次实际操作通过重启 DSH 确保配置生效；不过当前一些 DSH settings-file 实现已经支持监听 `settings.yaml` 外部修改并热发布配置，因此“修改配置必须 kill 进程”不应该当成永久规则。是否需要重启，应以你实际安装的 DSH 版本为准。

---

# 十四、这次排查真正教会我的，不是两行 YAML

表面上看，这次修复最后只是：

```yaml
supportsStrictMode: true
input: [text, image]
```

但真正有价值的是建立了一套排查 Agent 问题的思维模型。

以后再遇到类似问题，我会先把整个系统拆成四种不同的事实：

| 层级             | 它回答的问题                 |
| -------------- | ---------------------- |
| Capability     | 模型和 provider 声称自己能做什么？ |
| Schema         | 模型被告知工具需要哪些参数？         |
| Protocol       | 中间代理如何解释、补全或转换这些字段？    |
| Runtime Policy | 工具真正执行时允许什么？           |

这次三个错误正好分别落在不同层。

`does not declare image input` 是 Capability 问题。

`justification` 被错误生成，是 Schema / Protocol 问题。

`danger-full-access` 再升级失败，是 Runtime Policy 与动态 Schema 不一致的问题。

如果把它们全部归结成：

> 模型不聪明。

就永远排不干净。

---

# 十五、为什么 Agent 系统特别容易出现这种“隐形战争”？

普通 API 集成通常只有两端：

```text
Client
   ↓
Server
```

而 Agent 系统通常是：

```text
Agent Framework
      ↓
Tool Schema Generator
      ↓
LLM Adapter
      ↓
OpenAI-compatible Gateway
      ↓
Protocol Translator
      ↓
Model Backend
      ↓
Tool Call
      ↓
Runtime Validator
      ↓
Sandbox / Filesystem / Shell
```

每一层都有自己的：

```text
默认值
能力声明
Schema 子集
字段命名
安全策略
兼容逻辑
```

最危险的问题往往不是某一层明显报错。

而是每一层单独看起来都合理，组合起来以后语义发生了漂移。

例如：

```text
DSH：
这个字段可选。

Pi：
这个 provider 不声明支持 strict，所以我不发送 strict。

Proxy：
我按照自己的 Responses/Codex 规则规范化 Tool Schema。

模型：
既然 Schema 里存在这个字段，我生成一下。

DSH Runtime：
你这个 justification 不能为空。

Sandbox：
而且你申请的权限根本没有变宽。
```

没有任何一层单独是“疯了”。

但整个系统组合起来，就是一次失败的工具调用。

这就是 Agent 工程和普通 API 工程最大的区别之一：

**你不仅是在传数据，你还在跨系统传递“语义”。**

---

# 十六、最终结论：真正需要显式配置的，是系统之间的契约

这次问题最终可以压缩成三个结论。

第一，**不要依赖 `strict` 缺省值。**

尤其是在 OpenAI Responses、Codex 和各种兼容反代混用时，不同版本和适配层对于缺省字段的处理并不值得假设。

如果你明确需要非 strict Tool Schema，就应该让兼容层明确发出：

```json
"strict": false
```

第二，**不要通过模型名字猜能力。**

一个模型能不能读图片，在 Agent 框架里应该由：

```yaml
input: [text, image]
```

这样的 capability metadata 明确表达。

第三，**Tool Schema 应该描述当前真正可用的动作，而不仅仅是理论上的全部动作。**

如果会话已经处于：

```text
danger-full-access
```

那么“继续升级权限”实际上已经没有合法状态。

从长期架构上看，这种字段最好被动态裁剪，或者把 same-mode request 处理成幂等操作，而不是指望模型永远记住不要发送它。

这次修复因此更像是一次小型的“协议考古”。

最后改动的 YAML 很少。

真正花时间的，是弄清楚：

```text
谁定义了字段？
谁改变了 Schema？
谁解释了 strict？
谁声明了模型能力？
谁最终验证参数？
谁拥有真正的权限状态？
```

而这恰恰也是今天构建 AI Agent 最容易被忽视的一部分。

模型当然重要。

但一个模型最终表现得“聪明”还是“莫名其妙”，很多时候取决于工程系统究竟给了它一张什么样的世界地图。

**好的 Agent，不只是更聪明的模型。**

**好的 Agent，是模型、Schema、协议、能力声明与运行时策略之间，没有互相撒谎。**

---

## 最终配置参考

```yaml
llm-pi-ai:
  providers:
    kemeu:
      displayName: kemeu
      apiKeyEnv: KEMEU_API_KEY
      api: openai-responses
      baseURL: https://kemeu.cn/

      compat:
        supportsStrictMode: true

      models:
        - id: gpt-6-astra
          name: GPT-6 Astra
          input: [text, image]

        # ... other models
```

修改前建议先备份：

```bash
cp /root/.dsh/settings.yaml \
   /root/.dsh/settings.yaml.bak
```

然后确认实际运行版本是否支持配置热加载；如果不能确定，重启当前 DSH 会话/进程后，再按照“配置 → Schema → 图片输入 → 实际工具执行”四层逐一验证。

这次修复解决的是兼容层中的真实协议错位，但 `danger-full-access` 下升级字段仍然存在的设计问题并没有因此消失。原始排查报告对此也给出的状态是“部分缓解”，而不是“彻底修复”。
