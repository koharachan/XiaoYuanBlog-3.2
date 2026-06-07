---
title: "用 GitHub Issues 写文章"
published: 2026-06-07
updated: 2026-06-07
draft: false
description: "折腾了一下博客的发布流程，加了个小功能：以后写文章不用再手动建 Markdown 文件了，直接在仓库的 Issues 页面写，提交之后 Actions 会自动把它转成文章发出来。"
tags: ["更新","GitHub","中文"]
category: "更新"
author: "koharachan"
sourceLink: "https://github.com/koharachan/XiaoYuanBlog-3.2/issues/11"
comment: true
---

---

# 博客现在可以用 GitHub Issues 写文章了

折腾了一下博客的发布流程，加了个小功能：以后写文章不用再手动建 Markdown 文件了，直接在仓库的 Issues 页面写，提交之后 Actions 会自动把它转成文章发出来。

## 怎么实现的

核心是两个文件：一个转换脚本（`.github/scripts/issues-to-posts.mjs`），一个 Actions 工作流（`.github/workflows/issues-to-posts.yml`）。

工作流监听仓库的 Issue 事件，一旦有变化就触发脚本，脚本把 Issue 的各个字段拼成带 frontmatter 的 Markdown，扔进 `src/content/posts/` 里。字段的对应关系大概是这样：

- Issue 标题 → `title`
- Issue 正文 → 文章正文
- 第一个 Label → `category`
- 所有 Labels → `tags`
- 正文第一段 → `description`
- 正文第一张图片 → 封面图
- 创建/更新时间 → `published` / `updated`
- Issue 编号 → `sourceLink`（保留一个指回 Issue 的链接）

Issue 关闭了文章会自动变成草稿，删掉 Issue 文章也跟着删。

## 怎么用

进 Issues 页面，New Issue，写标题正文，加上 Label，提交。等 Actions 跑完刷新博客就能看到了。

---

这个是从 [QxBit](https://github.com/QingXuan2000/QxBlog)学来的办法，当然只是办法，所以不影响许可证
