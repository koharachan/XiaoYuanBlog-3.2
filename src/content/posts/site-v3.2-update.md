---
title: 小原blog 3.2 更新日志
published: 2026-05-16
updated: 2026-05-16
draft: false
description: 小原blog 3.2 版本更新记录，包括 UI 重构、性能优化、代码清理、全屏首屏背景、收款页重设计
image: /upload/banner-bg-desktop.png
tags: ["更新"]
category: 外版
comment: true
---
*本次代码修改及文章撰写均由 DeepSeek V4 Pro 完成，本文记录了开发过程中踩到的典型陷阱和对应的解决思路。*

小原blog 3.2 上线了！这次迭代的重心放在界面重构、代码质量提升和性能调优上。

## 桌面端全屏首屏

- Banner 区域撑满一整个视口（`100vh`），背景图以 `cover` 模式居中裁切，不留白边
- 向下滚动时，正文区域从屏幕底部平滑滑上来，逐渐遮住首屏背景，形成视觉上的层次过渡
- 桌面端使用专属背景图 `/upload/banner-bg-desktop.png`，不再跟移动端共用
- 首屏标题和副标题随滚动做动画：向上位移 15px 后按 `easeOutCubic` 缓动渐隐，滚过半个视口高度后彻底不可见
- 桌面端去掉了波浪装饰，移动端保留

## 背景图按设备分流

- `backgroundWallpaper.ts` 加入 `banner.display` 配置项，允许桌面和移动端各自独立指定 `fitMode`、`position`、`size`、`repeat` 和 `backgroundColor`
- 两个端默认都是 `cover` 居中
- 背景图不再出现偏移或留白，会根据设备宽度自动裁切

## 赞助收款页重做

- 页面从静态展示彻底改造成可实际使用的支付聚合面板
- **支付宝**：点击链接唤起支付宝 App
- **微信**：通过 `weixin://dl/scan` 直接触发扫一扫
- **QQ 支付 / 数字人民币**：引导用户扫码
- **PayPal**：跳转 paypal.me 页面
- **ERC20 / TRON**：支持任意 Token 打款，不限于 USDT，一键复制钱包地址
- **Gate.io / OKX**：提供站内转账用的二维码
- 所有二维码图片均下载到本地 `public/assets/images/sponsor/`，不再依赖远程 CDN
- 收款页加载时自动关闭 Banner 壁纸模式，换用半透明毛玻璃卡片作为背景，不受全屏布局影响
- 各支付渠道的图标使用原生品牌色：微信绿 `#07C160`、QQ 蓝 `#12B7F5`、支付宝蓝 `#1677FF`，以及 TRON 红、数字人民币红、Gate 蓝、ERC20 以太蓝

## 卡片整体视觉提升

- `#main-grid` 引入半透明背景 + 毛玻璃模糊效果 + 10px 内边距 + 大圆角
- Footer 改为不透明的 `card-bg` 背景
- 修复了非 Banner 模式下内容区与导航栏间距为 `1.5rem`（即 24px）
- 文章卡片现在有 stagger 级联动画：依次淡入、上浮并微微放大，过渡时长 450ms
- 导航栏按钮（如壁纸开关）加上了 hover 放大和 active 缩小的微交互

## 图标颜色归位

- TRON、e-CNY、Gate.io、ERC20 四枚自定义 SVG 图标重新上回各自的品牌色
- 微信、支付宝、QQ、PayPal 这些 Iconify 图标则通过 `color` 属性精确指定颜色
- 不再统一吃 `--primary` 主题色

## 友链变动

- 新收录：雨酱Ai（api.rainchan.com）、jinao的小窝（cn.jinao.wang）、洛嗷呜の小站（luoaowoo.cn）
- 移除：惠州新闻网

## 构建与依赖修复

- 删掉了 `astro.config.mjs` 中已废弃的 `astro/runtime` 引用，这东西在 Astro 6 + Vite 7 下会直接导致构建失败
- `manualChunks` 从对象映射改为基于路径匹配的函数式写法
- `@astrojs/rss` 先锁定 `4.0.11` 以兼容 Astro 6 内建的 Zod 3，后续升级到 `4.0.18` 彻底解决 Zod API 不兼容导致的 RSS 生成崩溃
- `pnpm-lock.yaml` 不再纳入 Git 版本管理，改由部署平台在构建时自动生成，避免锁文件与 `package.json` 不一致引发的 CI 故障

## 代码清理

- **ImageWrapper 组件**：去掉了不符合 HTML5 规范的冗余包裹元素，`id` 和 `class` 直接挂在 `<img>` 标签上
- **清扫死代码**：移除了 `setting-utils.ts` 中早已不用的 `adjustMainContentPosition` 和 `adjustMainContentTransparency`
- 构建输出：0 error，0 warning

## 其他零零碎碎

- 网站标题换成「小原blog 3.2 - 万物可爱QwQ」
- 公告前面的喇叭 emoji「📢」去掉了
- 赞助配置 `sponsor.title` 改成「给小原打钱」，「一键支付」改成「前往支付」
- 夜间模式切换动画用了「慢—快—慢」三段式贝塞尔曲线

## 踩坑记录

### 1. 一个 class 改名搞崩了移动端

**经过**：为了让 `body.enable-banner.is-home` 这条规则生效，我把 Tailwind 的响应式前缀 `lg:is-home` 改成了无前缀的 `is-home`。没想到 `Layout.astro` 里面绑在 `is-home` 上的 Banner 高度和位移规则也跟着在移动端生效了，和移动端原来的 `object-cover h-full` 撞车，移动端 Banner 直接只剩半截，上面留了一大片空白。

**怎么修**：用 `@media (min-width: 1024px)` 把桌面端才需要的位移规则包了一层，移动端只走 `layout-styles.css` 里已有的小屏规则。

**反思**：改全局 class 之前，先全仓库 grep 一下看它被哪些选择器引用了。

---

### 2. 收款页被推到屏幕下面去了——CSS 优先级打不赢

**经过**：全屏首屏设计会把内容区推到 `top: 100vh`（桌面）和 `margin-top: 85vh`（移动），收款页也没能幸免。第一次用 `:has(.pay-page)` 选择器想覆盖，但它干不过 `:not()` 的权重；第二次在 pay.astro 里内嵌 `<style>`，修好了一个断点却漏了另一个断点的 `margin-top`。

**怎么修**：放弃跟 CSS 优先级死磕，直接 JS 上场——`document.body.classList.remove("enable-banner")` 再加隐藏 `#banner-wrapper`，一刀把 `body.enable-banner` 的所有规则全部关掉。

**反思**：CSS 优先级打不赢的时候，从 JS 侧直接掐断条件比无限叠 `!important` 干净得多。

---

### 3. 赞助页二维码 404——路径猜了三次

**经过**：先是猜了个 `https://blog.rainchan.com/sponsor/wxpay.png`，当然是 404。然后在原站 HTML grep `<img src>` 才找到真实路径 `/assets/images/sponsor/`，但图源用的是远程 CDN，推到生产环境后图片就没了。

**怎么修**：curl 把 9 张二维码全下载到本地 `public/assets/images/sponsor/`，路径全改成本地引用。

**反思**：引用前先验证能不能访问；生产环境资源必须放在自己仓库里。

---

### 4. `w-4.5 h-4.5`——Tailwind 并没有半档

**经过**：pay.astro 里自定义 SVG 图标写了 `w-4.5 h-4.5`，Tailwind JIT 不会报错，但也生不出对应的 CSS，宽高当场塌成 0。图标全没，用户来问"logo 怎么不见了"的时候我还一脸懵。

**怎么修**：老老实实用 `w-5 h-5`。

**反思**：Tailwind 不存在 `w-4.5` 这种小数档位，查不到的 utility class 不会报错，只会安静消失。

---

### 5. `astro/runtime` 构建炸了——没在本地先跑一遍

**经过**：`astro.config.mjs` 里的 `manualChunks` 和 `optimizeDeps.include` 引用了 `astro/runtime`。Astro 6 已经不暴露这个路径了，Vite 7 的严格解析器直接抛 `Missing specifier`。推了 main 之后部署一直失败。

**怎么修**：删掉 `astro/runtime`，`manualChunks` 改成按 `node_modules` 实际路径做函数式分流，顺便把已经 external 掉的 `@fancyapps/ui` 也移除了。

**反思**：动构建配置之后，一定先本地 `npx astro build` 跑一遍再推送。

---

### 6. `@astrojs/rss` 的 Zod 版本陷阱——猜了三次版本号

**经过**：`@astrojs/rss@4.0.15` 依赖 Zod 4 的 `z.function().returns()` 方法，而 Astro 6.3.3 内置的是 Zod 3。结果生成 RSS 的时候直接类型报错。先降到 `4.0.10`，lockfile 不一致 CI 不通过；回到 `^4.0.15`，RSS 继续炸；最后锁 `4.0.11` 才稳下来。

**原因**：`4.0.11` 是 `@astrojs/rss` 里最后一个跟 Zod 3 兼容的版本，之后的版本引入了 `returns()`，必须搭配 Zod 4。

**反思**：不了解框架内部依赖的 API 断点就只能盲猜。有 node_modules 的时候直接翻包的 peerDependency 或 changelog 最靠谱。

---

### 7. lockfile 入库导致 CI 挂掉

**经过**：合并分支时 Git 自动把 `pnpm-lock.yaml` 弄进了暂存区，提交推送后，CI 里的 pnpm 开了 `--frozen-lockfile`，发现 lockfile 里有 `@astrojs/rss@4.0.15` 但 `package.json` 里不是——版本对不上，安装直接失败。

**怎么修**：`git rm --cached pnpm-lock.yaml` 把 lockfile 从跟踪中移除，补到 `.gitignore`，让部署平台自己生成。

**反思**：搞清楚部署平台对 lockfile 的策略再决定要不要提交它。

---

### 8. 以为 `4.0.11` 就稳了，结果又炸了一次

**经过**：把 `@astrojs/rss` 精确锁在 `4.0.11`，以为这样就安全了。但部署平台重新 `pnpm install` 时，lockfile 不在仓库里，包管理器按自己的默认逻辑解析依赖，实际装上去的不是 `4.0.11`，RSS 生成又炸出同一行：

```
TypeError: z.function(...).returns is not a function
  at @astrojs/rss/dist/index.js:6:51
```

那就很明显了——装上的版本不是 `4.0.11`，而是某个用了 Zod 4 API 的中间版。查 npm registry，最新稳定的是 `4.0.18`。这个版本已经完整处理好了兼容性。

**怎么修**：把 `package.json` 里从精确锁 `"4.0.11"` 改成 `"^4.0.18"`，让 pnpm 拉最新稳定版。`rss.xml.ts` 一行不用改，API 完全兼容。

**反思**：
1. 没有 `^` 的精确版本号在 lockfile 不存在时根本不锁——不同缓存、镜像、平台可能解析出不同版本。
2. 带 `^` 前缀配上 CHANGELOG 明确无 breaking change 的补丁版本（`^4.0.18`），比裸精确版本更稳。
3. `z.function().returns is not a function` 是 Zod 3 ↔ 4 断点的特征报错——看到这个就别猜版本号了，直接查 peerDependency。

---

**这些坑有一个共同点**：只要动的不是纯表面的东西——class 名、构建配置、依赖版本——就必须把影响面遍历一遍，grep 引用、本地 build、翻 changelog。但凡少做一步，就会被连锁反应教育。

---

万物可爱QwQ
