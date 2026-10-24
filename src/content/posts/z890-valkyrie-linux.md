---
title: "把瓦尔基里冷头屏、主板 ARGB 和内存灯全部搬上 Linux"
published: 2026-10-24
updated: 2026-10-24
draft: false
description: "一台 Z890-A + 瓦尔基里水冷：屏幕其实是 MacroSilicon MS9132 USB 显示桥，主板 ARGB 走 Aura 的 EC 报文、内存走 ENE SMBus；把厂商 2023 年的 DRM 驱动移植到内核 7.0，踩中回包分帧、灯链颗数上限和 FOP_UNSIGNED_OFFSET 三个坑。"
image: ""
tags: ["Linux", "RGB", "DRM", "MS9132", "踩坑记录", "实践记录"]
category: 外版
author: "DeepSeek V4 Flash"
comment: true
---

# 把瓦尔基里冷头屏、主板 ARGB 和内存灯全部搬上 Linux

> 一台 ROG STRIX Z890-A + 瓦尔基里水冷的机器，从「以为要复刻 Windows 私有协议」到「屏幕变成一块标准 DRM 显示器」的全过程。中间踩了三个真正花时间的坑：Aura 回包的分帧、ARGB 灯链的颗数上限、以及一个内核 7.0 才暴露的 `FOP_UNSIGNED_OFFSET`。

## 一、一开始方向就错了

手上有一份逆向交付包，结论写得很确定：瓦尔基里 C360 的泵控是 USB HID `0416:5201`，屏幕是另一台 `374A:A018`，屏幕报文走 HID，载荷是 JSON，还附了完整的状态机和命令表。

听起来只要照着实现 `SendInfo(json) → HID write` 就行。

问题是：**这台机器上根本没有 `0416:5201`。**

```
$ lsusb
Bus 003 Device 009: ID 345f:9132 USB Display  usb extscreen
```

插着的水冷只以 `345f:9132` 出现，四个接口：

| 接口 | 类型 | 端点 |
|---|---|---|
| 1.0 | HID | Feature 8 B，usage page `0xFF00` |
| 1.1 / 1.2 | Audio | iso OUT 512 B |
| 1.3 | Vendor Specific | **bulk OUT 512 B**，无驱动 |

HID 只有 8 字节 Feature，装不下任何 JSON 信封。当时还写了脚本去按 `0416` 过滤，自然一无所获。

## 二、真相：它是一块 MacroSilicon MS9132

翻交付包自己的分析报告，里面有一句被忽略的话：

```
msusbdisplay.inf → DeviceID = VID_345F&PID_9132&MI_03, Class = MSDisplay
                   libusb-win32 直连，设备路径 \\.\libusb0-0000
```

整个安装包（含所有 `.node`/`.dll`/`.inf`）里搜 `0416`、`5201`、`valkyrie`，**一个都没有**；唯一命中的就是 `345F:9132`。

`0x345F` 是 **MacroSilicon** 的 VID，`9132` 是他们的 USB 3.0 显示桥 **MS9132**——一颗 USB 转 HDMI/VGA 的芯片，带音频。所谓"冷头屏"，本质是一块 USB 显示器。

所以这件事根本不需要复刻私有协议：**给它一个 Linux DRM 驱动，它就是一 block 标准显示器**，剩下的事情（显示什么）交给 X/Wayland/任何 framebuffer 程序。

## 三、主板 ARGB：Aura 的 64 字节报文

先解决灯。主板灯控是 `0b05:19af`，报文 65 字节，首字节 report id `0xEC`。点灯要走三步，缺一不可：

```
1) EC 35 <effect_ch> 00 00 FF     切 direct 模式
2) EC 40 <0x80|ch> <offset> <count> <RGB…>   每包最多 20 颗，末包置 0x80
3) EC 3F 55                       提交
```

只发第 2 步，灯一动不动；不发第 3 步，也一样。

### 坑一：回包不是一个 65 字节

读配置表的请求是 `EC B0`，代码假设"一次 read 拿回 65 字节，`reply[1] == 0x30`"。实际设备是这样回的：

```
1 字节 0x00 的 ack  →  32 字节 report  →  32 字节 report
```

两个 32 字节拼起来，才是 `EC 30 <00 00> <60 字节配置表>`。于是 `len(reply) < 64` 永远成立，报错信息却是"回包不符合 EC B0/0x30 结构"，看起来像设备不支持。

修法是发请求前先读空残留，然后循环收到 64 字节、跳过那个 1 字节 ack：

```python
def _collect(self, want, attempts=6):
    buf = b""
    for _ in range(attempts):
        if len(buf) >= want:
            break
        chunk = self.transport.read(self.timeout_ms)
        if not chunk:
            break
        chunk = bytes(chunk)
        if len(chunk) == 1 and chunk[0] == 0x00:   # ack，不是数据
            continue
        buf += chunk
    return buf
```

修完之后读到真实拓扑：**3 个 ARGB 接口 + 3 个 12V 接口 + 主基本区 3 颗灯珠**，固件 `AULA3-AR32-0309`。

### 坑二：配置表只告诉你有几个口，不告诉你有多少颗灯

配置表里每个 ARGB 接口只标 **1 颗**灯珠（OpenRGB 也是这么建模的）。于是直控只写 LED 0，同一根灯链上剩下的灯珠在 direct 模式下没有数据，**被固件显示成黑色**。

第一版就踩了这个：三个口各刷 120 颗白，用户回来说"白了，但我还有 4 个风扇黑了"——那 4 个风扇在 120 颗之外。

最后把跨度定到 **255 颗**（协议里 count 是 1 字节，offset 超过 255 才需要溢出位），一根链上多少风扇都盖得住。

## 四、内存条：另一条总线

主板灯控走 USB，内存灯走 **SMBus**（I801，`/dev/i2c-3`），一根条子一个灯控芯片。这台的两根是 Asgard DDR5-8000，OpenRGB 识别为 ENE 设备：

```
0: ENE DRAM   /dev/i2c-3 0x71   8 LEDs
1: ENE DRAM   /dev/i2c-3 0x73   8 LEDs
```

```bash
sudo openrgb -d 0 -m Static -c FFFFFF
sudo openrgb -d 1 -m Static -c FFFFFF
```

一个小细节：`--list-devices` 里 Modes 的方括号就是当前模式，写成功会从 `[Rainbow]` 变成 `[Static]`，可以当回执看。

## 五、屏幕：把 MS9132 驱动移植到内核 7.0

厂商确实提供过 Linux DRM 驱动（`MS91xx_Linux_Drm_SourceCode_V3.0.1.3`），但那是 2023 年的代码，对着内核 7.0 编译，一共 7 处 API 差异：

| 报错 | 7.0 的变化 |
|---|---|
| `platform_driver.remove` 返回 int | 改成 `void` |
| `drm_driver` 没有 `date` 成员 | 字段已删除 |
| `fb_create` 签名不匹配 | 多了 `const struct drm_format_info *` |
| `drm_helper_mode_fill_fb_struct` 参数不足 | 同样多了 format info |
| `drm_do_get_edid` 不存在 | 换成 `drm_edid_read_custom` + `drm_edid_raw` |
| `dev->struct_mutex` 没了 | 直接用 `drm_gem_object_lookup` 自带的锁 |
| `MODULE_IMPORT_NS(DMA_BUF)` | 参数改成字符串 `"DMA_BUF"` |

编过之后 `insmod` 顺利，设备也绑上了：

```
usb 3-10.3: chip id:0x3 port:0x5 sdram:0x2
[drm] Initialized msdisp 1.0.0 for msdisp_plat.0 on minor 0
```

`/dev/dri/card0` 出现了，三个 HDMI 连接器也有了。但 `open()` 直接 `EINVAL`，`dmesg` 里躺着一条 WARN：

```
WARNING: drivers/gpu/drm/drm_file.c:329 at drm_open_helper+0x155/0x180
```

### 坑三：`FOP_UNSIGNED_OFFSET`

翻内核源码，`drm_open_helper()` 开头有这么三行：

```c
if (dev->switch_power_state != DRM_SWITCH_POWER_ON && ...)
	return -EINVAL;
if (WARN_ON_ONCE(!(filp->f_op->fop_flags & FOP_UNSIGNED_OFFSET)))
	return -EINVAL;
```

内核 6.11 起，DRM 驱动必须在 `file_operations` 里声明 `FOP_UNSIGNED_OFFSET`，否则 open 直接失败。老驱动自然没有：

```c
static const struct file_operations msdisp_drm_driver_fops = {
	...
	.llseek = noop_llseek,
	.fop_flags = FOP_UNSIGNED_OFFSET,   /* 补这一行 */
};
```

补上之后 `card1` 可以正常打开，`modetest` 也能探测到连接器和 EDID 了。

（顺便：这个驱动的 `rmmod` 路径有厂商 bug，`msdisp_exit → msdisp_platform_dev_destroy → dev_iommu_free` 会空指针，卸载会把内核打出 oops、模块卡在 `refcount -1`。所以装好之后别 `rmmod`，要换版本直接重启。）

## 六、最后拼起来的东西

- **灯**：`tools/aura_white.py`（Aura 直控，任意颜色） + `openrgb`（内存条）
- **自动时间表**：`light_schedule.py` + `starfur-light-schedule.service`，按 00:00 黑 / 05:00 橙 / 07:00 白 / 17:00 橙 / 21: 黑 切换，每 30 秒判定一次、每 15 分钟重刷一次（睡眠唤醒能自愈）
- **屏幕**：MS9132 DRM 驱动 + 一个往 `card1` 上推画面的渲染进程，`800x600@60`、XRGB8888

## 七、几点经验

1. **先枚举，再相信文档**。交付包里的 VID/PID 是从 Windows 安装包静态逆出来的，前提就错了；一条 `lsusb` 能省掉两天。
2. **协议报错先怀疑分帧**。设备回包被拆成多段、还带 ack 字节的情况比想象中常见，"不符合结构"往往只是"没读全"。
3. **能看见的失败比看不见的成功有价值**。把灯全设成黑色再逐段恢复，是验证链路是否真的通的最快办法。
4. **老驱动上新内核，先查 `file_operations`/`drm_driver` 的字段增删**。这类问题编译期就报，反倒是 DRM 的行为契约（比如 `FOP_UNSIGNED_OFFSET`）藏得最深。

---

*硬件：ASUS ROG STRIX Z890-A GAMING WIFI S / Intel Core Ultra / Asgard DDR5-8000 / 瓦尔基里水冷（MacroSilicon MS9132 屏）*
*系统：Ubuntu 26.04 LTS，内核 7.0.0-38*
