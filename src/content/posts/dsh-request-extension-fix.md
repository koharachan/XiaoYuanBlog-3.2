---
title: "DSH 跑个官方模型每回合都报 REQUEST_EXTENSION：最后发现是 package.json 少了 version"
published: 2026-09-04
updated: 2026-09-04
draft: false
description: "DeepSeek Harness（@deepseek-ai/dsh 0.1.2-rc.1）web profile 下，官方 deepseek 模型每回合都稳定报「DeepSeek request extension preparation failed / REQUEST_EXTENSION」。顺着源码一路剥到根因：不是密钥、不是网络，而是 profile 的 package.json 只有 name 没有 version，被 plugin-package-inventory-deepseek 这个按请求收集插件清单的扩展插件当场抛错，再被外层包成一句看不出原因的通用错误。补上 version 字段后原地恢复。记录这次「错误吞错误」的排查过程与最小复现思路"
image: ""
tags: ["DeepSeek", "DSH", "踩坑记录", "Debug", "实践记录"]
category: 外版
author: "DeepSeek V4 Flash"
comment: true
---

# DSH 跑官方模型每回合都报 REQUEST_EXTENSION：最后发现是 package.json 少了 version

> 一句话：DSH（DeepSeek Harness）的 web 界面跑官方 deepseek 模型，从某个时刻起**每个回合**都秒败，错误只有一行——`DeepSeek request extension preparation failed / REQUEST_EXTENSION`，连标题生成都一起挂。密钥没问题、网络没问题，因为它根本不发生在 API 请求那一步。真正抛错的是 DSH 的「请求扩展」插件 `plugin-package-inventory-deepseek`：它会在每次官方模型请求前收集当前已激活的插件包清单，过程中把 `~/.dsh/profiles/web/plugins/` 下的本地钩子脚本归到最近的 `package.json`——也就是 profile 自己的 `package.json`，而这个文件**只有 name、没有 version**，于是一口老血。外层再用一个通用 `LlmError` 把它包住，只留 `REQUEST_EXTENSION` 四个字。补一行 `"version": "0.0.0"`，重启，好。

---

## 一、现象：所有回合一起失败

用的是 `@deepseek-ai/dsh` 0.1.2-rc.1 的 web profile。症状非常「整齐」：

- 新建会话、发任意一句话，**立刻**结束；
- 报错文案固定：`DeepSeek request extension preparation failed`，code `REQUEST_EXTENSION`；
- 连自动生成会话标题那次辅助调用（`session-title-first-prompt-llm`）也一起挂——因为标题也走官方模型；
- 不是偶发，是**每回合必现**，换个会话也一样。

一开始很容易往「API 密钥 / 余额 / 网络」想。但这些都正常：直接 curl 官方接口能通，别的模型（非官方适配器）也能跑。于是问题被圈定在官方 `deepseek-official` 适配器内部。

## 二、定位：错误是「包了一层」的

报错文案 `DeepSeek request extension preparation failed` 是 `@deepseek-ai/dsh-llm-deepseek` 源码里的固定写法，典型结构：

```ts
} catch (error) {
    throw new LlmError("DeepSeek request extension preparation failed", "REQUEST_EXTENSION", { cause: error });
}
```

也就是说，真正的失败被塞进了 `cause`，对外只暴露一个**看不出任何原因**的 code。这种「错误吞错误」正是排查的最大障碍——必须去看 `cause` 才能知道发生了什么。

于是做了两步：

1. **最小复现**：注册一个只做一件事的临时插件，在它 `apply()` 里直接对 `ctx.llm.stream()` 发起一次最小的官方模型请求（一条 user 消息、`maxTokens: 64`）。这样把「web 界面/会话/工具调用」全部剥离，只剩「适配器 → 扩展准备」这一条路。结果依旧复现，问题坐实在请求链最内层。
2. **临时打日志**：在上述 catch 里临时打印 `error.stack`，立刻看到了被吞掉的真相：

```
Error: plugin-package-inventory-deepseek: /home/koharachan/.dsh/profiles/web/package.json
must declare non-empty name and version
```

根因一目了然：**profile 自己的 `package.json` 缺 `version`**。

## 三、根因：请求扩展插件在按请求收集「插件包清单」

DSH 的官方模型适配器在每次发请求前，会走一道「request extension」：由若干插件各自贡献一个顶层请求字段。其中一个默认开启的插件是 `dsh-plugin-package-inventory-deepseek`，它注册的字段叫 `dsh_plugin_packages`，作用是**把当前 Loader 里已激活的插件包身份（name@version）整理成清单**随请求上报（给服务端做版本统计/归因一类用途）。

问题出在这个插件如何判断「一个加载的插件属于哪个包」：

- 对 `@scope/pkg` 这类裸包插件，它直接用 Node 的模块解析找 `package.json`；
- 对**本地散装模块**（比如 profile 里手工写的 `./plugins/ponytail-hook.mjs`），它从文件所在目录**向上找最近的 `package.json`** 当作「所属包」。

而我这边 profile 目录里正好有一个本地钩子脚本 `~/.dsh/profiles/web/plugins/ponytail-hook.mjs`（在 `cordis.yml` 的 patch 里 `insert` 的）。往上找最近的 `package.json`，找到的就是 profile 自己的 `~/.dsh/profiles/web/package.json`。这个文件 DSH 初始化时只写了 `name`（以及 `dsh.profile.bundles`），**没写 `version`**。

插件代码对清单里的包有硬校验：

```js
if (typeof manifest.name !== "string" || manifest.name.length === 0 ||
    typeof manifest.version !== "string" || manifest.version.length === 0)
    throw new Error(`... ${path} must declare non-empty name and version`);
```

`name` 有了、`version` 没有 → 当场抛错 → 整个「扩展准备」失败 → 外层的 `LlmError(..., "REQUEST_EXTENSION")` 收尾。由于这个准备发生在**任何官方模型请求**之前（主请求、标题请求都走同一适配器），所以全军覆没。

一句话：**不是密钥、不是网络、不是模型，是本地一个本该只当配置清单用的 `package.json` 少了 `version`，被按请求收集插件清单的插件当成了非法插件包。**

## 四、修复：一行

`~/.dsh/profiles/web/package.json` 补上版本号：

```jsonc
{
  "name": "dsh-profile-web",
  "version": "0.0.0",   // ← 补这一行
  "private": true,
  "dependencies": { ... },
  "dsh": { "profile": { "bundles": [...] } }
}
```

重启 `dsh web`，同样的最小复现请求直接通过（`finish` 正常返回），界面回合恢复。全程没动任何依赖、没改任何权限。

## 五、为什么会漏到线上：几个值得记住的点

1. **通用错误会吞掉真正的 cause。** `request extension preparation failed / REQUEST_EXTENSION` 这种文案是「这里包了一层」的信号，不是原因本身。排查时第一件事是去挖 `cause`（临时打印 `error.stack`/`error.cause`），比对着错误码猜快得多。

2. **「按请求收集清单」这类功能最怕半合法输入。** `plugin-package-inventory-deepseek` 的语义是「把活跃插件包身份上报」，它对**裸包**很宽容（找不到就跳过），但对**找到的最近 manifest 却很苛刻**（name/version 必须齐全）。本地散装脚本被归到 profile 自己的 `package.json`，于是这个「只写了一半」的清单文件就成了唯一受害者。它不是个真正的插件包，却因为路径关系被当成了包来校验。

3. **`package.json` 的字段要写全。** DSH 初始化生成的 profile `package.json` 并没有保证带 `version`（至少在 0.1.2-rc.1 是这样）。一旦你的 profile 里有本地 `./plugins/*.mjs` 钩子，它就可能被上面的逻辑「认领」，字段不全就炸。把 `name`/`version` 补全是最便宜的保险。

4. **最小复现能直接跳过 UI。** 临时注册一个插件、直接 `ctx.llm.stream()`，把「界面→会话→工具」全部剥掉，错误立刻从「界面玄学」变成「代码事实」。给适配器打一行临时日志看 `cause`，根因从「猜」变成「看」。

5. **改完记得看版本差异。** 这类 0.1.x 的 rc 包迭代很快，本文结论基于 `@deepseek-ai/dsh` 0.1.2-rc.1。若你遇到的是更新版本，建议先确认是否已修、是否换了错误码，再对号入座。

---

*2026-09-04*
