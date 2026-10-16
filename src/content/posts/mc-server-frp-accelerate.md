---
title: "为 MC 服务器加速！端口转发折腾到 frp"
published: 2025-11-01
updated: 2025-12-20
draft: false
description: "给一台广州电信家里云的 MC 服务器做中转：杭州、广州两台阿里云和 Nginx 都试过，最后因为动态公网 IP 换成 frp，平均 18ms，至少不用重启了。"
image: /upload/image-YgDE.jpg
tags: ["frp", "MC", "服务器", "折腾记录"]
category: 外版
comment: true
---

先放一段当时测出来的路由：

```text
12  113.109.*.* (113.109.243.218)  27.650 ms  26.974 ms  26.108 ms
```

很明显，一跳又一跳。为什么这样子反而可能更稳定？因为阿里云自带 BGP，跨网的丢包少了；但跳数增加以后，延迟也上去了，几乎在中国东边绕了一圈，直接变成减速器了。

不过 DeepSeek 当时的说法是，跳数增加不代表最终延迟一定更高，于是我先按它说的试了一遍：

- **Windows 直连：** 40ms（移动 → 电信）
- **通过跳板：** 40ms（移动）+ 27ms（电信）≈ **67ms**

想了半天的小原想起了一句话：实践是检验真理的唯一标准。

于是小原便发到了服务器群里面：

![线路测试](/upload/image-YgDE.jpg)
![中转测试](/upload/image-uoRi.jpg)

没想到对服主提升巨大，还被加到了群公告里面：

![群公告](/upload/2ed9bad3cfae0ac1686e306c0c40ef86.jpg)
![玩家反馈](/upload/47df17d091126f419b151781a90584f7.jpg)

玩了一个星期，小原发现其他北方地区玩家确实提升巨大，但她自己玩——有个蛋用。

于是小原一气之下让同学帮忙实名阿里云，用新用户优惠买了一台广州服务器重新配。

## 换广州节点，开始折腾 Nginx

这次为了降低占用、节省时间，小原使用了 [GMSSH](https://gm.cn)，输入服务器 IP 和 SSH 密码后直接在线进入面板，不用下载和安装。进去之后用 `wget` 下载 Nginx，解压、`make`，再在 GMSSH 应用商店里装 Nginx 管理器。

选择 Nginx 默认安装位置和默认配置，和上面一样如法炮制。只是这次小原想到了一个问题：家里的公网 IP 会变，如果不重新解析，转发就会失效；而想重新解析，通常只能重启或者等 DDNS 自己更新。

所以这次加了：

```nginx
resolver 223.5.5.5 119.29.29.29 valid=20s;
resolver_timeout 5s;
```

但是过了几天，小原发现这两行并没有什么卵用，一样会报错，而且还不知道到底是源站服务器挂了，还是解析没有更新。

于是她决定改用 frp。

## 为什么改用 frp

Frp 可以解决动态公网 IP 变化后无法实时感知的问题，大幅提高稳定性。

正常来说，端口转发获取 IP 依赖 DDNS 域名。公网 IP 变化后，DDNS 要过一会儿才能检测到；即使 3～5 秒检测一次，也会有空窗。检测到变化后，还要通知 DNS 服务商把域名指向新 IP，接下来又是 DNS 广播和运营商缓存，最长可能有十分钟不同步。

游戏这边可没这么有耐心。短则 3～8 秒就断线重连，超过 10 秒玩家基本已经被退出主界面了。

但用 frp 的话，运营商换 IP、家里网络重新连上以后，`frpc` 会主动重新连回服务器。第一个心跳包最多大约几秒就能到，这个时候玩家可能只是突然卡一下，甚至无感，效果确实好很多。

当时的服务器大概是这样：

- 杭州阿里云——Ubuntu 24.04，2 核 2G，200M
- 广州阿里云——CentOS 9，2 核 2G，200M
- 广州电信家里云——Windows，配置没有仔细记

## 解决方案：frp

Frp 有服务端 `frps` 和客户端 `frpc`。`frps` 上配置端口和密钥，`frpc` 用同一个端口和密钥连过来，再在客户端配置要转发的端口和协议。

`frpc` 要装在运行 MC 服务器的同一台机器上，必须让服主配合。小原给服主简单说明了一下，然后开始配 `frps`，由服主在服务器上配置 `frpc`。

### 先划个重点

从 v0.52.0 开始，frp 支持 TOML、YAML 和 JSON。

**INI 已经被弃用，后面的新功能只会在 TOML、YAML 或 JSON 里提供。** 所以不要继续照抄十年前的 INI 教程。

### frps

原文里的端口和 token 做了脱敏，配置格式整理成这样：

```toml
bindPort = 7000

[auth]
method = "token"
token = "你的连接口令"

[log]
level = "info"
maxDays = 3
disablePrintColor = false
```

### frpc

```toml
serverAddr = "服务器地址"
serverPort = 7000

[auth]
method = "token"
token = "和服务器端完全相同的连接口令"

[[proxies]]
name = "minecraft"
type = "tcp"
localIP = "127.0.0.1"
localPort = 25565
remotePort = 25565

[[proxies]]
name = "rdp"
type = "tcp"
localIP = "127.0.0.1"
localPort = 3389
remotePort = 3389
```

有人可能就想问了：为什么要转发 RDP？因为运维让我也顺便转发一下 RDP。

链接上服务器：

![frp 连接状态](/upload/2fcef43b4b9912c279fbad2ffdc5efcd.jpg)

总之这样子就是好了，然后就可以进游戏看看了。

![游戏测试 1](/upload/0eca9a7d1cdeeec64d854141d7e56856.jpg)
![游戏测试 2](/upload/31a684421bbb3bfc4d8392d605946d40.jpg)
![游戏测试 3](/upload/cdb67158e16eb21c0df485029b410176.jpg)

平均 18ms，emm……一般般吧，起码不用重启了。

好了结束了，给个图：![最后的截图](/upload/未标题-1.jpg)
