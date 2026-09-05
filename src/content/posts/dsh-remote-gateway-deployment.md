---
title: "给 DSH 加一个访问网关：一次远程部署的踩坑流水账"
published: 2026-09-06
updated: 2026-09-06
draft: false
description: "把 DeepSeek Harness 的 Web 界面（dsh web）从 loopback 搬到公网域名 dsh.chf.org.cn，套一层 Flask 登录网关 + 高防 CDN。记录这一路的坑：登录页乱码、API 403、WS 连不上、模型不回复，以及每个问题真正的原因和最终解法。"
tags: ["DSH", "DeepSeek", "部署", "反向代理", "WebSocket", "实践记录"]
category: 外版
author: "koharachan"
comment: true
---

# 给 DSH 加一个访问网关：一次远程部署的踩坑流水账

> 一句话：我把 DeepSeek Harness 的 Web 界面从 loopback 搬到了公网域名，套了一个 Flask 登录网关和一层高防 CDN。重点不是「怎么配」，而是「为什么每个坑都是这么长的」。

---

## 一、背景：为什么要给 DSH 加网关

**DeepSeek Harness（DSH）** 的 Web 界面（`dsh web`）是为**本机 loopback（127.0.0.1）**设计的——它把整个推理编译链、模型请求、会话状态都绑在本机，`--host 0.0.0.0` 更是被官方**刻意禁掉**（见源码里的报错）：

> `--host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead`

也就是说，DSH 认为「能跑到这个 Web 的用户」=「这台机器的主人」。一旦你把 `dsh web` 反向代理到公网域名，就**打破了它的安全假设**，等于在跟 DSH 内置的一整套「浏览器信任围栏 / 会话绑定」对着干。

我这次想做的事很简单：**让 DSH 在 `dsh.chf.org.cn` 上可用，多用户、浏览器直接访问，前面有一层登录页 + 高防 CDN**。目的是让 Team 里的同学不用 SSH、不装东西，浏览器打开就能用模型。

于是就有了这趟踩坑之旅。

---

## 二、第一坑：登录页 gzip 乱码

最开始的部署是：CDN → Flask 网关（登录页）→ DSH。登录页能出来，但 `GET /` 之后返回的是一堆二进制乱码，开头是 `1f 8b 08`（gzip 魔数）。

**排查**：用 curl 分别测「直连网关」和「经 CDN」，发现：
- 直连网关 + `Accept-Encoding: gzip` → 返回**压缩体但没有 `content-encoding` 头**；
- 浏览器为什么看到乱码？因为它收到 gzip 字节，却没有 `Content-Encoding: gzip` 告诉它去解压。

**根因**：DSH 后端按请求里的 `Accept-Encoding` 决定是否 gzip；而 Flask 网关用 `httpx` 转发时，上游为了省流量会 gzip，网关却**剥掉了 `content-encoding` 头**，于是「压缩的字节 + 没头的响应」就喂给了浏览器/CDN。

**修**：让网关对上游永远输出**明文**——别信上游的压缩，自己用 `iter_bytes()`（httpx 自动解压）而不是 `iter_raw()`，并且**强制上游 `Accept-Encoding: identity`**。这样网关永远给明文，CDN 要压缩就自己带着正确的头，浏览器就能正常渲染了。

---

## 三、第二坑：登录后 API 全部 403「forbidden」

页面能开了，但登录后所有 `/api/...` 的 XHR 都是 **403**，响应体就两个字 `forbidden`。

**排查**：从源站用 curl 打到网关、经 CDN、甚至直连 DSH，**全都 200**；唯独浏览器里 403。一度以为是 CDN 的 WAF——把 scdn 的防护、防盗链、CORS 关了个遍，**依旧 403**。

**真正的根因（读 DSH 源码才确认）**：DSH 的 `/api` 有一个**浏览器信任围栏**（`api-request-trust.ts`），它的核心判断是：

```ts
new URL(origin).host === hostUrl.host
```

浏览器对 XHR POST 必定带 `Origin: https://dsh.chf.org.cn`。而 Flask 网关**原样把 `Origin` 转发给了 DSH**，DSH 一看 Origin 是 `dsh.chf.org.cn`，但它自己的 authority 是 `127.0.0.1:3082`，**对不上 → 403**。

**修**：网关在转发给 DSH 时**剥掉 `Origin`（还有 `Referer`）**。DSH 收到无 `Origin` 的请求，就当同源处理，接受了。顺手把 `Host` 也转发成 `dsh.chf.org.cn`，配合 DSH 的 `--trusted-host`。

> 教训：`forbidden` 这个纯文本 403 不是 CDN/WAF 的（它会返回 HTML 拦截页），而是 **DSH 后端**的。所以关 CDN 的 WAF/防盗链完全没用——得从 DSH 的角度想。

---

## 四、第三坑：WS 会话连不上（`remote.mux` 反复重连）

API 通了，但 DSH 前端的 WebSocket（`/api/remote.mux`）一直「connection lost，retry」，控制台交互全挂。

**排查**：我开始以为是 scdn 的 HTTP/2 WebSocket（RFC 8441）不支持——scdn 确实对 h2-WS 返回 404，h1-WS 返回 101。但把 HTTP/2、HTTP/3 都关了让浏览器走 h1，**依旧失败**。所以不是传输层。

用 `simple_websocket` 复现 app 的首条消息（`{"type":"open","streamId":...,"endpoint":"$events","payload":{"args":{}}}`）——连上 101 后，**DSH 约 2 秒内以 1000 正常关闭**。这说明 DSH 接受了握手，但**没走完会话激活**。

**根因**：DSH 的会话绑定取决于**页面 hostname**。源码里有一条：

```ts
isLoopback = transport.ownsHost === true || isLoopbackHostname(location.hostname)
```

- 页面在 `127.0.0.1`（loopback）→ `isLoopback = true` → 数据层、WS 会话、host 设置全部走完整；
- 页面在 `dsh.chf.org.cn`（非 loopback）→ **`isLoopback = false`** → host 设置降级为 memory（于是出现「settings are unavailable in this browser」）、实时事件流/模型回复投递被砍。

`--trusted-host` 能让 DSH 的 `/api` 信任围栏**接受非 loopback 域名**（这个必要且已经做了），但**改不了「页面非 loopback → isLoopback=false」**这一事实。

**修**：既然「served pages never carry the global at all」，那就在**网关层注入**——DSH 的 app HTML 里塞一行：

```html
<script>window.__DSH_TRANSPORT__=window.__DSH_TRANSPORT__||{ownsHost:true};</script>
```

让浏览器认为「页面 owns Host」→ `isLoopback = true` → host 设置、`connection.start()`、`$events` 生成源全部走完整，WS 会话和模型回复流也就稳定了。

> 这一步是「多用户、非 loopback、浏览器直连」能成立的关键。只靠 `--trusted-host` 治的是围栏，治不了 DSH 的 loopback 会话绑定。

---

## 五、最终架构

```
浏览器 ──> scdn 高防 CDN ──> Flask 网关(3081) ──> DSH web(127.0.0.1:3082)
                │  TLS/防护        │ 登录页 /auth          └─ 注入 ownsHost
                │                  │ 剥 Origin/Referer
                │                  │ 转发 Host=dsh.chf.org.cn
                │                  └─ WS → DSH(101)
```

- **登录**：`/koharachan` 黑白极简登录页；未登录 `/` 返回 503、`/*` 返回 404；登录后下发 HMAC cookie。
- **API**：网关剥 Origin 转发，DSH 接受。
- **WS/模型**：注入 `ownsHost`，`isLoopback=true`，会话、模型回复都通。
- **认证**：DSH 以 `--trusted-host dsh.chf.org.cn` 启动，`/api` 围栏放行。

---

## 六、小结

这套东西能落地，靠的是**读懂 DSH 的安全假设，而不是硬配**：

1. DSH 只信 loopback，`--host 0.0.0.0` 被禁；
2. 非 loopback 下，`isLoopback=false`，host 设置降级 + 实时流被砍；
3. 信任围栏用字面 `Origin === Host`，反代必须剥 Origin；
4. 网关注入 `ownsHost=true`，把非 loopback 场景「伪装」回 DSH 能完整处理的形态。

每一层都在**顺着 DSH 的安全模型做**，而不是绕过它。落地后：`dsh.chf.org.cn` 登录 → 选模型 → 发消息 → **有回复**，多用户浏览器直连无障碍。

---

*（文中的 DSH 指 DeepSeek Harness 的 `dsh web` 界面；网关为自研 Flask 反代 + 高防 CDN。）*
