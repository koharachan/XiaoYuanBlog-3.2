---
title: "DSH 接入 Codex 风格反代时的三类协议兼容问题"
published: 2026-09-20
updated: 2026-09-20
draft: false
description: "DSH 经 OpenAI Responses 兼容反代调用 Codex 模型时出现空 justification、权限升级被拒和不声明图片输入三类报错，追到适配层默认值与模型能力元数据后，用两行配置修复。"
image: ""
tags: ["AI", "Codex", "DSH", "反代", "实践记录"]
category: 外版
comment: true
---

DSH 通过 OpenAI Responses 兼容适配器调用 Codex 风格反代时，我遇到过三条看起来互不相关的报错：

```text
invalid justification: expected a non-empty sentence
sandbox escalation to "danger-full-access" is not strictly wider than this call's current "danger-full-access" mode
model "gpt-6-astra" does not declare image input
```

最后定位到的不是提示词问题，而是三层信息没有对齐：DSH 的工具定义、`pi-ai` 适配器生成的请求、以及反代声明的模型能力。本文保留实际排查路径，去掉与具体网关域名和登录入口有关的内部信息。

## 最小修复

自定义 OpenAI Responses provider 的配置需要明确声明严格模式和输入模态：

```yaml
compat:
  supportsStrictMode: true
input: [text, image]
```

前者让适配器发送 `strict: false` 等兼容字段，后者只表示“这个 provider 声明可以接收图片”。如果后端实际上不支持图片，就不要照抄第二行。

## 1. 空 justification：先看序列化后的 Tool Schema

DSH 的工具参数里，`justification` 和 `sandbox_permissions` 是可选字段。排查时我发现，自定义 provider 在 `getCompat` 中把 `supportsStrictMode` 的默认值处理成了 `false`；另一个共享适配文件却使用了不同的默认值。经过适配器后，原本可选的字段被反代的 strict 转换器变成了 `required + nullable`。

模型为了满足这个 Schema 只能填一个空字符串，随后被 DSH 的业务校验拒绝，于是出现 `expected a non-empty sentence`。

验证时不要只看 YAML，而要看三个位置：

1. DSH 发出的工具定义是否仍把字段标记为可选；
2. 适配器序列化后的 JSON Schema 是否把它们加入 `required`；
3. 发往反代的请求里 `strict`、`additionalProperties` 等字段是否符合预期。

设置 `supportsStrictMode: true` 后，这条链路恢复为兼容模式，空 justification 的报错消失。它是适配层兼容修复，不代表所有反代都应开启 strict。

## 2. `danger-full-access`：这是权限阶梯的正常拒绝

第二条报错不是模型失控，而是 DSH 的权限升级规则：只有当新请求比当前权限严格更宽时，升级才有意义。当前已经是 `danger-full-access`，再次请求同一个模式当然不满足“严格更宽”。

这类问题不能靠 provider 的兼容字段修好。更合理的处理是：

- 在运行时按实际权限裁剪工具 Schema；或
- 对相同权限的重复声明做幂等处理，而不是再次进入升级流程；
- 排查时分别在默认权限和 `danger-full-access` 下运行一次，确认错误来自权限判断而不是模型输出。

## 3. 图片能力：能力元数据是契约

`does not declare image input` 表示模型能力元数据没有声明图片输入，不等价于“模型一定不支持图片”。Responses 适配器需要依赖 `input` 或 `inputModalities` 之类的字段决定是否接受图片内容。

因此要把三件事分开验证：

- 反代实际是否能转发图片；
- provider 的模型元数据是否声明 `text, image`；
- DSH 是否真的发送了图片，而不是只在配置中写了能力。

如果后端不支持图片，声明 `image` 只会把错误推迟到更后面，不能算修复。

## `openai-responses` 与 `openai-codex-responses` 不要混看

这次排查还暴露出一个容易忽略的差异：两个 adapter 对 `supportsStrictMode` 的默认值并不相同，一个路径默认偏向 `false`，另一个路径可能传递 `true` 或 `null`。所以遇到相同报错时，第一步应确认实际使用的 adapter，而不是只看 provider 名称。

## 一套可重复的验证顺序

1. 保存原始配置和一次正常请求；
2. 只改变 `supportsStrictMode`，比较序列化后的 Tool Schema；
3. 再改变输入能力声明，发送一条真实文本请求；
4. 如果后端支持图片，再发送一张图片验证完整链路；
5. 最后分别测试默认权限和已授权的 `danger-full-access`，不要把权限错误混入协议错误。

这三条报错分别属于 Schema 生成、权限状态机和能力元数据。把它们拆开后，问题就从“模型不听话”变成了可以逐层比对的协议兼容问题。
