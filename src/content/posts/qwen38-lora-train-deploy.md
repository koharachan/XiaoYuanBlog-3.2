---
title: "从零训练到上线：一个 27B 混合架构模型的四天流水账"
published: 2026-08-22
updated: 2026-08-22
draft: false
description: "从 4×RTX PRO 6000 上训练 Qwen3.8-27B LoRA，到 vLLM 部署、frp 内网穿透、sub2 中转，再到 FlashInfer 在 SM120 上从编译失败到跑通的完整记录。踩过的坑：torch inductor 模板冲突、Mamba cache 不足、FlashInfer CUDA 版本不匹配、SM120 被当成 SM100 家族误判"
image: ""
tags: ["AI", "LLM", "LoRA", "vLLM", "部署", "实践记录"]
category: 外版
comment: true
---

# 从零训练到上线：一个 27B 混合架构模型的四天流水账

> 一句话：把「卷心菜」从 33828 条蒸馏数据训成 LoRA，再部署到公网 API——训练只花了四小时，部署和调优花了三倍时间。这篇文章记录那些「模型加载成功不等于能跑」的时刻。

---

## 一、训练：四小时，比想象中顺利

训练机是 4×RTX PRO 6000（96GB），torchrun 4 进程跑 Qwen3.8-27B 的 LoRA。数据集是 round2 的 33828 条——base 语料、Grok-4 蒸馏、sky/kimi 重答混合，带 reasoning_content。

525 步，每步约 26 秒，全程 3 小时 47 分。Loss 从 5.67 一路降到 0.667，grad_norm 全程 0.09-0.27 没炸过。

```text
103/525 [44:29<3:02:58, 26.02s/it]   # 训练中途
525/525 [3:46:42<00:00, 25.91s/it]   # 完成
TRAIN_DONE /root/autodl-tmp/models/Qwen3.8-27B-lora
```

训练本身没遇到什么幺蛾子——**真正的战场在部署**。

## 二、部署：vLLM 的「每个组件都差一步」

### 2.1 第一个坑：torch 2.13 的 inductor 模板冲突

vLLM 0.27.1 装好后，一启动就崩：

```text
AssertionError: duplicate template name
```

查下去是 vLLM 的 `env_override.py` 在 import `torch._inductor.lowering` 时，torch 2.13 自带的 flex_attention 模板重复注册。打补丁绕过后，又冒出第二个：

```text
duplicate extern kernel: _grouped_mm
```

一个个补丁打过去，终于 import 通过。**但 pyc 缓存还在用旧代码**——`SyntaxError: invalid syntax` 报错行号永远指着一行不存在的 `def try:`，清 `__pycache__` 才解决。教训：**改了 Python 源码，先删 pyc 再怀疑自己的补丁写错**。

### 2.2 第二个坑：Mamba cache 不足

模型能加载了，但初始化 KV cache 时崩：

```text
max_num_seqs (1024) exceeds available Mamba cache blocks (630)
```

这个混合架构（48 层 linear_attention + 16 层 full_attention）的 Mamba cache 块数受显存限制。解法很简单：`--max-num-seqs 600`，把并发上限压到 630 以内。**vLLM 的报错其实说得很清楚，照着调就行。**

### 2.3 第三个坑：FlashInfer 不认 SM120

RDX PRO 6000 是 Blackwell SM120（compute capability 12.0），而 FlashInfer 0.6.16 的 JIT 检测直接报：

```text
Failed to get device capability: SM 12.x requires CUDA >= 12.9
```

系统里装的是 CUDA 12.8 的 nvcc，不够。但 pip 的 `nvidia-cuda-nvcc` 包其实是 **13.3**——只是 FlashInfer 没找到它。设 `CUDA_HOME` 指向它，FlashInfer 立刻识别出 `TARGET_CUDA_ARCHS: {(12, '0f')}`，能编译了。

然后链接又挂：`cannot find -lcudart`。cu13 的库在 `lib/` 不在 `lib64/`，软链一下解决。

### 2.4 第四个坑：vLLM 不认为 SM120 属于 SM100

编译过了，但 vLLM 还是 fallback 到 Triton：

```text
GDN prefill backend 'flashinfer' is selected but cannot use this kernel
```

查代码：`is_device_capability_family(100)` 返回 False——它的语义是「major 家族」，SM120 是 major 12，SM100 是 major 10，**在 CUDA 13 的 family 语义下确实不同家族**。vLLM 的保守拦截是对的，但这张卡永远用不上 FlashInfer 的 GDN 优化。

打补丁放宽判定（把 120 也认成可用），FlashInfer 真的跑起来了：

```text
Using FlashInfer GDN prefill kernel (requested=flashinfer, head_k_dim=128)
```

prefill 提速了。但 decode（逐 token 生成）还是 25 tok/s——**这是混合架构 GDN 层的串行特性，vLLM 目前没有针对 SM120 的 GDN decode 优化内核**。

## 三、速度的真相

| 场景 | 速度 |
|---|---|
| 单请求 decode | ~25 tok/s |
| 8 并发聚合 | ~175 tok/s |
| 代码生成 1024 tokens | 41.6 秒 |

单请求慢是**架构特性**（48 层 GDN 递归每 token 全算一遍），不是配置问题。换显卡无用（带宽翻倍也救不了串行）；换引擎（SGLang 有 GDN packed decode 优化）有机会，但部署成本高。

**并发下其实不错**：continuous batching 把 8 个请求合并跑，单请求延迟反而降到 0.8s。对多用户 API 场景，够用。

## 四、公网暴露：frp + sub2 的三层链路

推理机在 AutoDL 内网，公网访问靠两层转发：

```text
用户 → sub2 平台 (51.79.56.174) → frp 隧道 (103.40.14.172) → 推理机 8000
```

**踩过的坑**：

1. **frpc 不会自动重连**：vLLM 重启时端口短暂关闭，frpc 连接断掉后不恢复。公网「突然用不了」多半是这个。
2. **sub2 模型没配价格**：请求能通，但日志刷 `no pricing available for model` 警告，计费显示零成本。
3. **境外链路抖动**：三层转发都在境外，用户在国内访问时偶发断流（`Stream ended without finish_reason`）。排查半天，本地和公网两端测试都正常——**是网络链路的偶发抖动，不是服务器问题**。

## 五、几个经验

1. **训练容易部署难**：四小时训练 vs 十几小时部署调试，模型加载成功离「能对外服务」还差很远。
2. **报错要往上游查**：`duplicate template name` 表面是 vLLM 的问题，根子在 torch 2.13 和 triton 的版本组合。
3. **新硬件（SM120）是新坑**：Blackwell 消费级新卡，推理框架支持滞后一年，FlashInfer、vLLM 各有各的适配缺口。
4. **concurrent 是救命稻草**：单请求慢的架构，并发下聚合吞吐反而健康，服务设计时把并发吃满。

---

**后记**：SGLang 的 venv 还在推理机上躺着（torch 2.11 + kernel wheel 已备好），等网络稳定了续装——如果它真能把 GDN decode 从 25 拉到 100+ tok/s，那这篇文章就该写续集了。
