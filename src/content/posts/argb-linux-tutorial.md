---
title: "手把手：在 Linux 改主板 ARGB 颜色，并按时间自动切换"
published: 2026-10-24
updated: 2026-10-24
draft: false
description: "不装 Armoury Crate，直接在 Ubuntu 上用三条 Aura 报文改主板 ARGB 颜色，再用一个 systemd 服务按时间表自动切白/切橙/关灯；附内存条（ENE SMBus）的改法和三个常见坑。"
image: ""
tags: ["Linux", "RGB", "Aura", "systemd", "教程"]
category: 外版
author: "DeepSeek V4 Flash"
comment: true
---

# 手把手：在 Linux 改主板 ARGB 颜色，并按时间自动切换

> 全套脚本在 [这个 gist](https://gist.github.com/koharachan/3f762b51abe08914e119230356f5ff80)，四个文件：`aura_set.py`、`schedule.py`、`schedule.json`、`lightctl.service`。下面是从零到能用的完整过程。

## 适用与前提

- 华硕主板，带 Aura USB 灯控（`0b05:19af`），Z490 之后的基本都是这套
- Ubuntu / Debian，有 root
- 内存条灯是另一条路（SMBus + OpenRGB），单独说
- **不需要** Windows，也不需要 Armoury Crate

## 第 1 步：确认灯控在

```bash
lsusb | grep -i 19af
# Bus 003 Device 008: ID 0b05:19af ASUSTek Computer, Inc. AURA LED Controller

ls /sys/class/hidraw/
# hidraw0  hidraw1  ...
```

没有这个设备就别往下走了：要么 BIOS 里 Aura 被关掉，要么这块板子的灯控不走 USB，本文不适用。

## 第 2 步：装依赖

```bash
sudo apt install python3-hid openrgb
python3 -c "import hid; print('ok')"
```

`python3-hid` 是 hidapi 的绑定，`openrgb` 只用来改内存条。

## 第 3 步：改主板颜色

把 `aura_set.py` 放到任意目录，然后：

```bash
sudo python3 aura_set.py ff3300                  # 橙色
sudo python3 aura_set.py ffffff --mainboard      # 纯白，连主基本区那几颗一起
sudo python3 aura_set.py 000000                  # 全黑（相当于关灯）
```

参数只有三个：

| 参数 | 作用 | 默认 |
|---|---|---|
| `color` | 六位十六进制 RGB | 必填 |
| `--leds` | 每个 ARGB 接口刷多少颗灯珠 | 255 |
| `--mainboard` | 主基本区（板载灯）也刷 | 关 |

脚本启动时会先读一次固件的配置表，于是能知道这块板子**有几个 ARGB 接口、几个 12V 接口、本区几颗灯**，不需要按型号维护一张表：

```
ARGB 接口 3 个，12V 接口 3 个，主基本区 3 颗
已写入 #e05a1e
```

## 第 4 步：内存条

内存灯不走 USB，走 **SMBus**，每根条子一个灯控芯片。用 OpenRGB 最简单：

```bash
sudo openrgb --list-devices
```

找 `Type: DRAM` 的条目，记下前面的序号：

```
0: ENE DRAM
  Type:           DRAM
  Version:        I2C: /dev/i2c-3, address 0x71
  Modes: Direct Off [Static] ...
```

```bash
sudo openrgb -d 0 -m Static -c FFFFFF
sudo openrgb -d 1 -m Static -c FFFFFF
```

`Modes` 里方括号就是当前模式，写成功会变成 `[Static]`，可以当回执看。不是 ENE 的条子（海盗船之类）OpenRGB 也支持，序号和方法一样。

## 第 5 步：让它按时间自动切

### 5.1 放文件

```bash
sudo mkdir -p /opt/lightctl /etc/lightctl
sudo cp aura_set.py schedule.py /opt/lightctl/
sudo cp schedule.json /etc/lightctl/
```

### 5.2 时间表

`/etc/lightctl/schedule.json`：

```json
{
  "argb_leds": 255,
  "dram_devices": [0, 1],
  "segments": [
    {"start": "00:00", "color": "000000"},
    {"start": "05:00", "color": "e05a1e"},
    {"start": "07:00", "color": "ffffff"},
    {"start": "17:00", "color": "e05a1e"},
    {"start": "21:00", "color": "000000"}
  ]
}
```

- `segments`：**从某个时刻开始用什么颜色**，最后一段一直持续到第二天零点
- `argb_leds`：每个接口的刷写颗数，灯链长就写大点（见下面坑二）
- `dram_devices`：内存条的 OpenRGB 序号，不想管内存就写 `[]`

### 5.3 服务

`lightctl.service` 放到 `/etc/systemd/system/`，然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lightctl.service
systemctl status lightctl
journalctl -u lightctl -f
```

正常会看到：

```
17:00:12 -> #e05a1e
```

服务每 30 秒看一次时间，跨段就切；另外每 15 分钟无条件重刷一次——睡眠唤醒、设备复位之后能自己恢复。

### 5.4 改时间表

改完 JSON 执行 `sudo systemctl restart lightctl` 即可，不用重装。

## 三个坑，踩过才知道

### 坑一：只发颜色不提交，灯一动不动

Aura 点灯是三步，少一步都不行：

```
EC 35 <ch> 00 00 FF        切 direct 模式
EC 40 <0x80|ch> <off> <cnt> <RGB…>   每包 20 颗，末包置 0x80
EC 3F 55                   提交
```

很多资料只写了中间那步，结果就是“命令没报错，灯没反应”。

### 坑二：颗数不够，后半段灯变黑

配置表里每个 ARGB 接口只标 **1 颗**灯珠，照着发就只点亮第一颗，同一根链上后面的灯珠因为没数据被固件当成黑色。

一根链上挂几把风扇时尤其明显：常见的一把 20～30 颗，六把就是 120～180 颗。本文默认 `255`（协议里 count 是 1 字节，255 是安全上限），一根链基本都盖得住。

### 坑三：颜色发白、发粉

浅色（比如 `#d97757` 这种珊瑚色）在灯罩和导光柱下会被冲淡成粉白。想要“看起来是橙”，得提高饱和度，比如 `#e05a1e`。这不是 bug，是灯珠显色 + 亮度的物理限制——品牌色和“看起来像品牌色”往往是两个值。

## 排障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| `没有找到 AURA 控制器` | 灯控没被识别 | BIOS 里确认 Aura 开启；`lsusb` 看 `0b05:19af` |
| 脚本报配置表读取失败 | 回包被拆成两段 | 用本文脚本（已处理 1 字节 ack + 两个 32 字节 report） |
| 灯不亮但没报错 | 少了 commit | 用本文脚本 |
| 只有一部分灯亮 | `--leds` 太小 | 调到 255 |
| 重启后恢复原样 | 直控是易失的 | 交给本服务开机重刷，或在 BIOS 里设静态色 |
| 内存条不变 | 它在 SMBus，不在 USB | 用 `openrgb -d <序号>` |

## 恢复原状

```bash
sudo systemctl disable --now lightctl.service
sudo openrgb -d 0 -m Direct        # 或直接用 Armoury Crate / BIOS 设一次
```

断电重启后，主板和内存都会回到 BIOS / 固件的默认灯效——这也是为什么“定时切换”要靠服务在开机时重新下发一次。

---

*脚本：[gist.github.com/koharachan/3f762b51abe08914e119230356f5ff80](https://gist.github.com/koharachan/3f762b51abe08914e119230356f5ff80)*
