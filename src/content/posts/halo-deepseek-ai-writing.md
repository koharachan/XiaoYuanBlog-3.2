---
title: halo接入deepseek，自动写文章！
published: 2025-04-03
updated: 2025-04-03
draft: false
description: Halo博客系统接入DeepSeek AI，实现自动写作功能，提升创作效率
image: 
tags: ["网站","教程","halo","deepseek", "AI写作", "博客插件"]
category: 外版
comment: true
---

首先我们这里用深度求索官方的api举例子，打开[DeepSeek开放平台](https://platform.deepseek.com/usage)。

首先实名验证，然后开始我们的接入流程。

## 获取API

![](/upload/image.jpg)

点击api密钥 -> 创建api密钥

![](/upload/image-IKSt.jpg)

设置一个名称，这个设置什么都不会影响后面的步骤

![](/upload/image-FTZs.jpg)

获取到一个api，复制它，回到halo。

## 安装插件

![](/upload/image-FDjz.jpg)

打开halo控制台，点击应用商店，搜索ai，安装这个ai助手，然后点击插件 -> ai助手

![](/upload/image-hIiO.jpg)

![](/upload/image-IdRA.jpg)

点击基础设置 -> 要激活的ai -> openai

安装你的需求勾选并保存，然后点击OpenAi设置

![](/upload/image-wPqS.jpg)

把deepseek的api粘贴到 **OpenAi TOKEN 里面， API_BASE_URL 设置为https://api.deepseek.com**

**模型选择自定义模型，然后在下面选择一个**

<mark data-color="#e5e7eb" style="background-color: #e5e7eb; color: inherit">deepseek-chat</mark> 实际上就是deepseek v3，上下文长度64K

<mark data-color="#e5e7eb" style="background-color: #e5e7eb; color: inherit">deepseek-reasoner</mark> 实际上就是deepseek R1，上下文长度也是64K，比v3推理能力更强

价格看[模型 & 价格 | DeepSeek API Docs](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)

然后保存，打开编辑器，就能发现一个按钮了。
