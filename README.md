# 小原blog

一个以 Astro 构建的轻量个人博客，内容包括博客与服务器折腾、AI 实验、手机刷机、网络与日常记录。

- **站点**: [blog.meowhead.cn](https://blog.meowhead.cn)
- **构建**: Astro 6 + TypeScript
- **部署**: 静态输出，可部署到 EdgeOne Pages、GitHub Pages、Nginx 等
- **许可**: [MIT](LICENSE)

## 现在的界面

- **霓虹主题**：深色科技感背景、SVG 网格、粒子连线、节点碰撞和点击冲击波；
- **Cloud 主题**：浅色云层、低对比度粒子背景，适合长时间阅读；
- **经典主题**：`/ie/` 为 IE / 老旧浏览器准备的纯 CSS、无客户端 JavaScript 版本；
- **响应式**：手机、平板和桌面使用同一套清晰的列表布局，不依赖全屏 Banner 推动正文；
- **文章体验**：图片尺寸预留、懒加载、图片灯箱、代码复制、目录高亮、上一篇/下一篇；
- **性能**：不加载图标库、字体包或客户端路由；统计和广告在页面空闲或首次交互后加载；
- **内容**：文章保存在 `src/content/posts/`，支持 Markdown；图片保存在 `public/upload/`，构建时只把当前页面实际引用的图片复制到部署产物，未引用的原图仍保留在仓库素材库中。
## 本地运行

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:4321/>。

## 构建与检查

```bash
pnpm astro check
pnpm build
pnpm preview
```

构建输出位于 `dist/`。搜索数据由构建阶段生成的 `search.json` 提供，不需要运行时数据库。

## 写文章

文章放在 `src/content/posts/`，最小 frontmatter：

```markdown
---
title: 文章标题
published: 2026-10-16
description: 用一句具体的话说明读者能从文章中得到什么。
tags: [标签]
category: 外版
comment: true
---

正文。
```

`image` 可以填写 `/upload/...` 的本地封面。建议给本地图片保留真实尺寸，构建时会自动为文章和卡片补充 `width` / `height`，避免图片加载时页面跳动。

## 目录说明

| 路径 | 作用 |
| --- | --- |
| `src/config.ts` | 站点、作者、导航、友链、评论和赞助配置 |
| `src/layouts/Base.astro` | 现代主题全局布局与元数据 |
| `src/layouts/IeBase.astro` | 经典 / IE 兼容布局 |
| `src/styles/base.css` | 霓虹与 Cloud 主题、响应式布局和 SVG 背景样式 |
| `src/styles/prose.css` | Markdown 文章排版 |
| `src/styles/ie.css` | 经典主题的老浏览器 CSS |
| `src/scripts/main.ts` | 主题、搜索、灯箱、代码复制、懒加载和性能增强 |
| `src/scripts/net.ts` | 粒子网络与碰撞动画 |
| `src/lib/posts.ts` | 文章排序、标签、分类、摘要和阅读时间 |
| `src/content/spec/` | 关于、友链、留言板页面内容 |
| `src/pages/ie/` | IE 兼容版页面路由 |

## Issues 自动写文章

仓库保留 Issues → Markdown 的工作流，但只有仓库所有者创建的 Issue 才会触发转换。公开 Issue 不会自动变成已部署文章。生成内容仍应在发布前人工检查标题、简介、图片和来源。
