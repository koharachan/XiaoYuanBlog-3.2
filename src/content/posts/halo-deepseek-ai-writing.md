---
title: "给 Halo 博客接入 DeepSeek API"
published: 2025-04-03
updated: 2025-04-03
draft: false
description: "在 Halo 的 AI 助手插件中配置 DeepSeek API：创建密钥、填写 OpenAI 兼容地址和模型名，并用截图记录完整设置路径。"
image: "/upload/image.jpg"
tags: ["网站", "教程", "Halo", "DeepSeek", "AI写作", "博客插件"]
category: 外版
comment: true
---

这篇记录当时在 Halo 博客中配置 DeepSeek API 的过程。目标不是把密钥交给某个第三方平台，而是让 Halo 的 AI 助手插件通过 OpenAI 兼容接口调用 DeepSeek。Halo、插件和 DeepSeek 的控制台都可能更新，按钮名称变化时以当前界面为准。

## 准备工作

需要准备：

- 一个可以登录的 Halo 管理后台；
- AI 助手插件；
- DeepSeek 开放平台账号和余额；
- 一枚只用于这个站点的 API Key。

API Key 只应保存在 Halo 的服务端配置中，不要写进文章、截图或浏览器端代码。若密钥曾经公开，应立即在 DeepSeek 控制台撤销并重新创建。

## 创建 DeepSeek API Key

打开 [DeepSeek 开放平台](https://platform.deepseek.com/usage)，完成账号验证后进入 API 密钥页面。

![DeepSeek 开放平台](/upload/image.jpg)

点击“API 密钥”，再创建一枚新密钥。

![进入 API 密钥页面](/upload/image-IKSt.jpg)

为密钥填写一个便于识别的名称。名称只用于管理，不会改变模型能力。

![创建密钥](/upload/image-FTZs.jpg)

创建完成后只复制一次密钥，并回到 Halo 后台。不要把真实密钥截图放进文章或提交到仓库。

## 安装并配置 AI 助手

在 Halo 控制台打开应用商店，搜索 AI 助手并安装；随后从插件列表进入它的设置页。

![在应用商店搜索 AI 助手](/upload/image-FDjz.jpg)

![进入 AI 助手插件](/upload/image-hIiO.jpg)

![打开插件设置](/upload/image-IdRA.jpg)

在基础设置里，把要激活的 AI 类型设为 `OpenAI`，保存后进入 OpenAI 设置。

![选择 OpenAI 类型](/upload/image-wPqS.jpg)

按照下面的对应关系填写：

| Halo 配置项 | 填写内容 |
| --- | --- |
| OpenAI TOKEN | 刚创建的 DeepSeek API Key |
| API_BASE_URL | `https://api.deepseek.com` |
| 模型 | 选择自定义模型后填写可用的模型名 |

当时使用过的模型名是 `deepseek-chat` 和 `deepseek-reasoner`。模型名称、上下文长度和价格会随官方服务调整，当前值请以 [DeepSeek API 文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) 为准，不要把旧版本的模型别名写死在配置模板里。

保存后回到 Halo 编辑器，确认 AI 助手按钮能够出现。第一次测试建议使用一篇无敏感信息的草稿，并检查生成内容、调用次数和账单记录；不要直接让模型覆盖已发布文章。

## 常见问题

### 保存后请求失败

先检查 API Key 是否多复制了空格、`API_BASE_URL` 是否带了错误的路径，以及服务器是否能访问 `api.deepseek.com`。如果 Halo 的插件要求填写完整兼容路径，不要擅自把 `/v1` 重复拼接，按插件当前的请求示例验证。

### 模型名无效

不要根据旧文章里的“V3”“R1”简称猜模型名，直接使用 DeepSeek 控制台或 API 文档当前列出的模型 ID。

### 文章生成结果不稳定

API 接入成功只代表请求链路可用，不代表文章可以直接发布。先把 AI 输出当草稿，人工核对事实、引用、代码和个人信息，再决定是否保存或发布。

## 小结

这套配置的关键只有三件事：API Key 只放服务端、兼容地址填对、模型名以官方当前文档为准。以后更换其他 OpenAI 兼容服务时，也可以沿用同样的排查顺序，只替换服务地址、密钥和模型 ID。
