---
title: "红米 Note 4X 联发科版刷入 TWRP 与 root"
published: 2024-11-07
updated: 2025-01-23
draft: false
description: "红米 Note 4X 联发科版解 BL 锁、刷入 TWRP，再用与当前 ROM 匹配的 boot.img 修补并写回 boot 分区取得 root，附步骤截图和风险说明。"
image: "/upload/21750e6ed81dc48f0bc22bbe29ddf1df.jpg"
tags: ["root", "教程", "手机", "TWRP"]
category: 外版
comment: true
---

> **适用范围**：本文只针对红米 Note 4X 的联发科（MTK）版本。高通版的分区、镜像和工具不同，不要直接照做。
>
> 解锁 Bootloader 会清除数据，刷错与当前系统不匹配的镜像可能导致无法开机。请先备份照片、聊天记录和原厂 ROM，并确认自己能找到对应的恢复镜像。

这是一篇按实际操作顺序整理的旧设备记录：解锁 BL → 刷 TWRP → 用当前 ROM 的 `boot.img` 修补 → 把修补后的镜像写回 `boot` 分区。工具界面和下载地址可能已经变化，文件名比软件截图更重要。

## 准备文件

需要准备：

- 小米官方解锁工具，并完成账号与设备绑定；
- 搞机助手 V4.9.1 或同类 fastboot 工具；
- 与手机当前 ROM **完全匹配**的 `boot.img`；
- `recovery-TWRP-3.2.1-0114-REDMI_NOTE4-CN-wzsx150.img`；
- Magisk 或当时使用的 Kitsune Mask 安装包；
- 一根可靠的数据线、ADB / Fastboot 驱动，以及一台 Windows 电脑。

原记录使用的文件包仍然放在[这个下载地址](https://pan.baidu.com/s/1ZR51rarBhkQCckx29_H4rw?pwd=qufm)，提取码为 `qufm`。下载后先核对文件名和来源，不要把来源不明的 `boot.img` 写入手机。

## 1. 绑定账号并解锁 BL

在手机中打开“设置 → 开发者选项 → 设备解锁状态”，绑定小米账号和设备。然后进入 Bootloader，三种常见方式任选其一：

- 关机后同时按住电源键和音量下键；
- 通过 ADB 执行：

```shell
adb reboot bootloader
```

- 使用 fastboot 工具中的“重启到 Bootloader”按钮。

![小米解锁入口](/upload/bf3429559207b64ed04221857a2ad2e2.jpg)

打开[小米解锁页面](https://web.vip.miui.com/page/info/mio/mio/tool/download?fromPathname=mioUnlock&app_version=dev.230112)，下载并运行 `miflash_unlock.exe`，同意声明后登录绑定的账号。

![小米解锁工具](/upload/8027c927e3bb68366b1a4e4966cba05e.jpg)

工具显示可以解锁后点击“解锁”，确认数据清除。部分账号可能需要等待解锁时间，这是账号状态，不是工具故障。解锁完成后不要急着进入系统，继续准备刷入 Recovery。

![确认解锁](/upload/bb3726ff6d61cd9743ff82bd1a181a89.jpg)

## 2. 刷入 TWRP

打开搞机助手，确认手机仍在 fastboot 模式，选择对应的 TWRP 镜像并执行刷入。

![进入 fastboot 工具](/upload/1511e11d59294c562207031f97bd8247.jpg)

刷入完成后进入 Recovery，而不是直接启动系统。第一次进入 TWRP 时按提示允许修改；如果系统覆盖了 Recovery，可以再次重启回 TWRP 检查是否保留。

![选择 TWRP 镜像](/upload/45c41e5732d8f642396f31d467f1c166.jpg)

![设备信息](/upload/3336f041a57652a34707806d8fd37ff3.jpg)

![TWRP 首次启动](/upload/0dc1ad481db65f7f2fc139f5ab895afe.jpg)

## 3. 修补 boot.img 并写回 boot 分区

先在手机上安装 Magisk 或 Kitsune Mask，选择“安装 → 选择并修补一个文件”，找到从当前 ROM 提取出的 `boot.img`，等待修补完成。

修补得到的文件通常在手机的 `Download` 目录中，文件名会带有 `magisk_patched` 一类前缀。回到 TWRP 的“安装”页面，选择“刷入 Image 镜像”，再选择修补后的文件，目标分区选择 `boot`，不要选择 `system` 或 `recovery`。

![TWRP 安装入口](/upload/3f4dbbd16bf3cc3d746b26bcd949fc16.jpg)

![选择 boot 镜像](/upload/fa8d2891bd82929336875ca99f3a6603.jpg)

确认分区后重启系统，进入 Magisk 检查 root 状态。第一次启动时间较长时不要连续强制重启；如果无法开机，回到 TWRP 刷回备份的原始 `boot.img`，再重新核对 ROM 版本。

![完成后的系统](/upload/21750e6ed81dc48f0bc22bbe29ddf1df.jpg)

## 常见卡点

- **工具识别不到手机**：重新安装 ADB / fastboot 驱动，换 USB 口和数据线，并确认手机屏幕显示 fastboot。
- **解锁按钮不可用**：检查账号绑定状态和等待时间，不要反复清除数据来“碰运气”。
- **刷入后卡开机**：优先恢复原始 `boot.img`，不要继续叠加刷入不匹配的镜像。
- **系统启动后没有 root**：确认写入的是修补后的 `boot` 镜像，并确认修补使用的原始镜像来自当前版本 ROM。

这类老设备刷机最重要的不是某个“一键工具”，而是三件事：确认硬件版本、保留原始镜像、每一步只写入与当前系统匹配的分区镜像。
