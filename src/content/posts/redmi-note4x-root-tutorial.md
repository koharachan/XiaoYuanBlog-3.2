---
title: 红米note4x移动定制/联发科MTK板刷面具root以及TWRP
published: 2024-11-07
updated: 2025-01-23
draft: false
description: 
image: /upload/21750e6ed81dc48f0bc22bbe29ddf1df.jpg
tags: ["root","教程","手机"]
category: 外版
comment: true
---

**注意：本文章仅针对使用联发科MTK板的高通板不完全适用本文章，不听变成砖头后果自负。**

这是目前第一篇对这个机型详细且没有过期的现代化程度高的教程文章，接下来让我们进入正题。

---
## 首先下载本次需要使用的文件

[点击此处下载文件](https://pan.baidu.com/s/1ZR51rarBhkQCckx29_H4rw?pwd=qufm)

提取码: qufm

然后你可以通过各种方法下载卡/线刷包，解压里面的`boot.img`文件，发送到手机，在手机下载面具或者安装上面的链接里面的“KitsuneMask27001无需改包名过ruru.APK”

[点击此处下载文件](https://pan.baidu.com/s/1ZR51rarBhkQCckx29_H4rw?pwd=qufm)

安装完成后，打开它，点击安装 -> 下一步 -> 选择并修补一个文件 -> 点击空白处 -> 右上角3个点 -> 显示sd卡 -> 左上角三条横杠 -> 内部存储 -> 找到并点击你的`boot.img`文件 -> 开始
## 再然后，我们来解锁BL，给手机插上手机卡，电脑打开小米社区，点击手机解锁

![bf3429559207b64ed04221857a2ad2e2](/upload/bf3429559207b64ed04221857a2ad2e2.jpg)

打开后，点击立即解锁，就会进入到[小米社区解锁页面](https://web.vip.miui.com/page/info/mio/mio/tool/download?fromPathname=mioUnlock&app_version=dev.230112)中，

![8027c927e3bb68366b1a4e4966cba05e](/upload/8027c927e3bb68366b1a4e4966cba05e.jpg)

接下来打开手机

1.进入“设置 -> 开发者选项 -> 设备解锁状态”中绑定账号和设备

2.进入Bootloader模式

**怎么进入Bootloader模式？**

答：以下方式选择一个

1.关机后，同时按住开机键和音量下键；

2.进入“设置 -> 检查更新，狂点miui图案直到出现提示，点击右上角3个点，重启到Bootloader；

3.使用命令调用adb重启；

```shell
adb reboot bootloader
```

4.安装上文文件夹中的“搞机助手_V4.9.1.exe”，然后

![1511e11d59294c562207031f97bd8247](/upload/1511e11d59294c562207031f97bd8247.jpg)

5.一直按住开机键和音量下键不放，手机自动强制关机并启动进入到Bootloader，然后放手。

接下来解压从小米社区下载的压缩包，打开“miflash_unlock.exe”，双击解锁工具后，会弹出负责声明和登录界面，我们点击“同意”按钮后登录就可以了，软件会自动的验证账号是否支持解锁。

出现“解锁”按钮后，按下解锁工具上的“解锁”按钮。

![bb3726ff6d61cd9743ff82bd1a181a89](/upload/bb3726ff6d61cd9743ff82bd1a181a89.jpg)

我们点击“确认解锁”。

这时手机就会进入自动解锁的过程，一会就会弹出解锁成功的提示，**不要**点击“重启手机”按钮。

安装上文文件夹中的“搞机助手_V4.9.1.exe”，然后

![45c41e5732d8f642396f31d467f1c166](/upload/45c41e5732d8f642396f31d467f1c166.jpg)

选择最开始网盘里面的`recovery-TWRP-3.2.1-0114-REDMI_NOTE4-CN-wzsx150.img` -> 刷入

[点击此处下载TWRP Recovery](https://pan.baidu.com/s/1ZR51rarBhkQCckx29_H4rw?pwd=qufm)

关闭这个窗口，回到搞机助手，点击设备信息，

![3336f041a57652a34707806d8fd37ff3](/upload/3336f041a57652a34707806d8fd37ff3.jpg)

进入TWRP后，划动划块

![0dc1ad481db65f7f2fc139f5ab895afe.jpg](/upload/0dc1ad481db65f7f2fc139f5ab895afe.jpg)

点击重启 -> Recovery 重启TWRP

然后点击安装

![3f4dbbd16bf3cc3d746b26bcd949fc16](/upload/3f4dbbd16bf3cc3d746b26bcd949fc16.jpg)

点击右下角的刷入Image镜像，打开Download文件夹，找到`magisk-`开头的文件，点击它，刷入到boot分区。

![fa8d2891bd82929336875ca99f3a6603.jpg](/upload/fa8d2891bd82929336875ca99f3a6603.jpg)

点击重启到系统，大功告成。

![21750e6ed81dc48f0bc22bbe29ddf1df.jpg](/upload/21750e6ed81dc48f0bc22bbe29ddf1df.jpg)
