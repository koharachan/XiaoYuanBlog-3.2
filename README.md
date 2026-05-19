# 🐝 Firefly — 小原酱的博客

基于 Astro 6 构建的现代个人博客主题，支持 Markdown/MDX、KaTeX 数学公式、Mermaid 图表、全文搜索、多评论系统、Live2D/Spine 模型等丰富特性。

- **站点**: [blog.meowhead.cn](https://blog.meowhead.cn)
- **版本**: 6.5.3
- **协议**: [MIT](LICENSE)

## ✨ 特性

- **内容**: Markdown / MDX 写作，代码高亮（Expressive Code），KaTeX 数学公式，Mermaid 图表
- **搜索**: Pagefind 离线全文搜索，支持中文分词
- **评论**: 可选 Twikoo / Waline / Giscus / Artalk / Disqus
- **主题**: 亮色 / 暗色 / 跟随系统，可调色相
- **壁纸**: Banner / Overlay / 纯色三种模式，支持毛玻璃
- **布局**: 列表 / 网格双模式，响应式侧边栏
- **特效**: 樱花飘落、Live2D / Spine 模型、打字机效果
- **分析**: Google Analytics、Microsoft Clarity
- **其它**: RSS、Sitemap、OG 图片、分享海报、友链

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev

# 构建
pnpm build

# 预览构建产物
pnpm preview
```

## 📁 文章管理

文章存放在 `src/content/posts/` 目录，支持 `.md` 和 `.mdx` 格式。

```markdown
---
title: 文章标题
published: 2026-05-19
description: 文章简介
tags: [标签1, 标签2]
category: 分类
draft: false
---

正文内容...
```

## ⚙️ 配置

所有配置集中在 `src/config/` 目录：

| 文件 | 说明 |
|------|------|
| `siteConfig.ts` | 站点标题、URL、导航栏、分析等 |
| `navBarConfig.ts` | 导航栏链接 |
| `sidebarConfig.ts` | 侧边栏组件 |
| `profileConfig.ts` | 个人信息卡片 |
| `commentConfig.ts` | 评论系统 |
| `fontConfig.ts` | 字体配置 |
| `backgroundWallpaper.ts` | 壁纸模式 |
| `sakuraConfig.ts` | 樱花特效 |
| `coverImageConfig.ts` | 封面图片 |
| `sponsorConfig.ts` | 赞助信息 |
| `adConfig.ts` | 广告配置 |

## 🛠 技术栈

- [Astro 6](https://astro.build) — 静态站点生成
- [Tailwind CSS 3](https://tailwindcss.com) — 样式
- [Svelte 5](https://svelte.dev) — 交互组件
- [Pagefind](https://pagefind.app) — 离线搜索
- [Expressive Code](https://expressive-code.com) — 代码高亮
- [KaTeX](https://katex.org) — 数学公式
- [Mermaid](https://mermaid.js.org) — 图表
- [Swup](https://swup.js.org) — 页面过渡动画

## 📄 许可

MIT © koharachan
