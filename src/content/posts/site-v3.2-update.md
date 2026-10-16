---
title: "升级 Astro 6 时踩过的八个坑"
published: 2026-05-16
updated: 2026-05-16
draft: false
description: "把博客升级到 Astro 6 / Tailwind 时遇到的八个问题：响应式 class 撞车、CSS 优先级、资源路径、Tailwind 静默失效、构建入口、RSS 依赖和 lockfile，附现象与排查方法。"
image: ""
tags: ["Astro", "Tailwind", "构建", "性能优化", "踩坑记录"]
category: 外版
comment: true
---

这篇不再记录按钮换了什么文案、哪张背景图放到了首屏，而是把博客升级过程中真正需要排查的八个问题整理出来。共同点是：表面看起来只是一个 class 或一个依赖版本，实际都会影响整条构建或渲染链路。

## 1. 全局 class 改名后，移动端 Banner 只剩半截

把 `lg:is-home` 改成无前缀的 `is-home` 后，桌面端规则开始在移动端生效，Banner 高度和位移与移动端的 `object-cover h-full` 规则冲突，页面顶部留下大块空白。

**修法**：把只属于桌面端的位移和高度规则放回 `@media (min-width: 1024px)`，不要只看修改处，要全仓库搜索这个 class 的所有选择器。

## 2. 收款页被全屏 Banner 推到屏幕下面

全屏首屏会把主内容推到 `100vh` 附近，收款页也继承了这套布局。第一次尝试用更高权重的 CSS 覆盖，结果漏掉另一个断点；最后给页面增加独立状态，关闭 `enable-banner` 并隐藏 Banner 容器。

**经验**：如果一个页面从语义上根本不需要某个全局布局状态，与其堆叠 `!important`，不如在页面入口明确关闭该状态，再让普通 CSS 接管。

## 3. 远程二维码在生产环境 404

开发时使用远程 CDN 图片，页面能显示；部署后远程路径失效，收款页的二维码全部 404。后来把二维码下载到仓库的 `public` 目录，统一改成本地路径，并在构建前检查每个引用文件是否存在。

**经验**：生产页面依赖的关键图片、字体和脚本要么纳入仓库，要么在 CI 中做可重复的下载与校验，不能只凭开发机缓存判断可用。

## 4. `w-4.5` 不会报错，但也不会生成 CSS

Tailwind 没有预置 `w-4.5`、`h-4.5` 这类 utility class。JIT 扫到未知类时不会替你猜尺寸，结果 SVG 的宽高没有生效，图标看起来像消失了。

**修法**：使用已有的 `w-5 h-5`，或者写明确的 arbitrary value，例如 `w-[18px] h-[18px]`。看到“样式无效”时，先确认这个 class 是否真的存在于当前 Tailwind 配置。

## 5. `astro/runtime` 被移除后，构建配置仍在引用

升级 Astro 后，配置里的 `manualChunks` 和 `optimizeDeps` 仍引用 `astro/runtime`，Vite 严格解析时出现 `Missing specifier`。修复方式是删除已经不再暴露的入口，并按实际的 `node_modules` 路径调整分包逻辑。

**验证**：构建配置每次改动后都先在本地运行 `pnpm astro build`，再提交 CI。只看开发服务器能启动是不够的，静态构建会走另一条解析路径。

## 6. `@astrojs/rss` 与 Zod 的 API 断点

当时 RSS 生成报错：

```text
TypeError: z.function(...).returns is not a function
```

排查依赖树后发现，某些 `@astrojs/rss` 版本调用了 Zod 4 的 API，而当前 Astro 组合仍使用 Zod 3。正确的处理顺序是查看包的 `peerDependencies`、变更日志和实际安装版本，而不是连续猜版本号。

本次重构后 RSS 已改成简单的 `@astrojs/rss` 用法；如果再次升级，应该把 Astro、RSS 集成和 Zod 作为一个兼容矩阵测试。

## 7. lockfile 策略不清导致 CI 安装失败

曾经出现 `package.json` 与 lockfile 中的 `@astrojs/rss` 版本不一致，CI 使用 `--frozen-lockfile` 后直接拒绝安装。问题不在“lockfile 一定应该提交”或“一定不应该提交”，而在仓库没有明确策略。

两种策略都可以：

- 提交 lockfile，并在本地用 frozen install 验证；
- 不提交 lockfile，同时让部署平台固定 pnpm 版本并在构建前重新生成。

关键是不要一边要求 frozen install，一边让 lockfile 和 `package.json` 长期漂移。

## 8. 精确版本、缓存和实际安装版本不要混为一谈

原记录把“没有 `^` 的精确版本号在没有 lockfile 时会自动漂移”当成结论，这是不准确的：包管理器通常会把精确 specifier 当作精确版本请求。真正需要查的是部署平台缓存、实际提交的 `package.json`、pnpm 版本和安装日志。

遇到同样的 RSS 报错时，建议保存以下证据：

```bash
pnpm why @astrojs/rss zod
pnpm list @astrojs/rss zod --depth 4
pnpm install --frozen-lockfile
pnpm astro build
```

如果本地和部署平台解析结果不同，再比较 lockfile 是否存在、缓存是否命中，以及构建实际使用的分支和提交。没有证据时，把根因写成“尚未确定”，比给出错误的版本规则更可靠。

## 一套升级前检查清单

1. 全局 class 改动：先搜索所有 CSS、脚本和组件引用；
2. 布局改动：至少测试首页、文章页、收款页和移动端；
3. 资源改动：构建前检查本地文件和远程响应；
4. Tailwind 改动：确认 utility 存在，或使用明确的 arbitrary value；
5. 构建配置：本地执行完整 build，不只运行 dev server；
6. 依赖升级：同时查看 peer dependency、CHANGELOG 和 lockfile；
7. 部署失败：保存实际安装日志，不用猜测替代证据。

这些步骤比某个具体版本号更耐用，也更适合下一次升级 Astro 或更换部署平台。
