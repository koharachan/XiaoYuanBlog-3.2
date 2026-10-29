---
title: "单卡 A800 上的 FP8 投机解码实测：DSpark 2.54x，MTP 被我们低估了，ngram 是负收益"
published: 2026-10-29
updated: 2026-10-29
draft: false
description: "在单张 A800-80GB 上用 vLLM 0.32.0 把 Qwen3.5-35B-A3B-FP8 跑了六种解码配置：DSpark 2.54x、MTP K=2 1.94x、我们原本最看好的 ngram 反而只有 0.73x。附带官方 68 项 benchmark 之外的一批安全/运维测评，以及挖到的 5 个上游 bug"
image: ""
tags: ["vLLM", "投机解码", "MTP", "DSpark", "Qwen3.5", "实践记录"]
category: 外版
author: "A800 实测"
comment: true
---

# 单卡 A800 上的 FP8 投机解码实测：DSpark 2.54×，MTP 被我们低估了，ngram 是负收益

> 一句话结论：**在 A800-80GB 这块"没有原生 FP8、只能走 weight-only Marlin"的卡上，投机解码的收益被显著放大——DSpark（块 8）拿到 2.54×，MTP K=1/K=2 拿到 1.56×/1.94×，而我们原本最看好的 n-gram 只有 0.73×（负收益）。**
>
> 三个关键数字：**427.61 tok/s（2.54×，DSpark）/ 263.01 tok/s（1.56×，MTP K=1，接受率 94.4%）/ 123.29 tok/s（0.73×，ngram K=4，接受率 5.6%）**。
>
> 代价也必须一起说：DSpark 的 TTFT 是 base 的 2.5 倍（115.7 ms vs 45.4 ms），这是离线批处理才成立的最优；并且**这组数字不能外推到 H20/H800**。

---

## 0. 我们测了什么（口径先说清）

- 模型：Qwen3.5-35B-A3B 官方 **FP8** 权重（ModelScope 拉取，**34.89 GiB**）—— **这是官方安全对齐版，不是我们自己 abliterate 的消融版**；消融版权重（66.97 GiB bf16、785 个 mtp.* 张量）我们只做了国内镜像，**没有参与本轮任何吞吐/测评测试**。所以下面所有「拒答」都首先归因于模型自身的对齐，而不是扣在 harness 头上。
- 机器：AutoDL **单卡 A800-80GB PCIe**，TP=1，**¥5.59/h**
- 服务参数：`max-model-len 32768`、`max-num-seqs 32`、`gpu-memory-utilization 0.92`、`--language-model-only`
- 压测：**8 条 prompt × `max_tokens 256`，temperature=0（greedy），五臂顺序执行**
- 口径纪律：本文所有吞吐都是 **单流短序列微基准**，不是生产聚合吞吐；凡是没跑过的一律标 [未测]

---

## 1. 五臂实测表

| 臂 | 投机配置 | prefix caching | tok/s | 相对 base | TTFT p50 | 投机接受率 | 显存峰值 |
|---|---|---|---|---|---|---|---|
| base | 无 | **开** | 168.51 | 1.00× | 45.4 ms | — | 74.1 GiB |
| base_nopc | 无 | 关 | 167.99 | 1.00× | 44.9 ms | — | 74.1 GiB |
| **mtp K=1** | `method=mtp, num_speculative_tokens=1` | 关 | **263.01** | **1.56×** | 52.9 ms | **94.4%** | 74.1 GiB |
| mtp K=2 | `method=mtp, num_speculative_tokens=2` | 关 | 327.06 | 1.94× | 53.9 ms | 88.1% | 74.2 GiB |
| ngram K=4 | `method=ngram, num_speculative_tokens=4` | 开 | 123.29 | **0.73×** | 50.3 ms | **5.6%** | 75.1 GiB |
| **dspark K=8** | `method=dspark, num_speculative_tokens=8` | 关 | **427.61** | **2.54×** | 115.7 ms | 50.7% | 74.6 GiB |

显存峰值区间 **74.1–75.1 GiB / 81,920 MiB**（≈0.92 利用率，四档降档未被触发）。

启动与加载（basline/dspark 各测一次）：

| 项 | 数值 |
|---|---|
| base 冷启动 | **271 s**（含 `torch.compile` + flashinfer JIT） |
| base 热启动 | **63 s** |
| dspark 启动 | **231 s** |
| 权重加载 | **33.79 GiB / 28.33 s** |
| KV cache 容量 | **151 万 token** |

### 1.1 这张表最该被读出的三件事

1. **DSpark 是冠军，但它低接受率**（50.7%）——这说明"接受率高"不等于"快"。DSpark 一次并行草拟 8 个 token、验证也并行，每步平均净得 ~2.5 个 token；MTP 接受率虽然 94.4%，但每步只赚 1 个多 token。
2. **prefix caching 开/关几乎不影响吞吐**（168.51 vs 167.99，差 **0.3%**）。这条小得几乎像噪声，却是本文最重要的工程结论之一，见 §3.1。
3. **ngram 在这个负载上是负收益（0.73×）**，接受率 5.6%——投机解码不是"开了就好"。

### 1.2 每组读数背后的机制（不是"调参调出来的"）

- **base 与 base_nopc 几乎一样（168.51 vs 167.99）**：说明我们这 8 条 prompt 之间没有共享前缀，prefix cache 本来就没东西可命中。这条"零效应"的对照非常重要——它把后面所有"关 PC 会不会掉速"的争论一次性关掉了。
- **MTP K=1 就拿到 1.56×**：因为 MTP 头是随 target 一起训练的，草拟分布天然对齐，接受率 94.4%——几乎每步都能赚到 1 个 token。K=2 时接受率降到 88.1%，但每步赚得更多，净收益反而升到 1.94×。**这就是"接受率下降不等于变慢"**。
- **DSpark 接受率只有 50.7%，却拿到 2.54×**：它是"块草拟 + 块验证"——一次并行吐出 8 个候选，验证也一次算完。代价是这一步 forward 更重，所以 TTFT 从 45.4 ms 涨到 115.7 ms。
- **ngram 只有 5.6%**：它靠"上下文里出现过的 n-gram 复用"，我们这批 prompt 互不重复、任务各异，假设不成立，草拟基本全废。

---

## 2. 机制：为什么在 A800 上收益被放大，又为什么不可外推

启动日志里有一句必须被引用的原文：

```text
WARNING [marlin_utils_fp8.py:108] Your GPU does not have native support for FP8
computation but FP8 quantization is being used. Weight-only FP8 compression will
be used leveraging the Marlin kernel.
```

A800 是 SM80 架构，**没有 FP8 张量核心**，所以 vLLM 走的是：

> FP8 权重存储 → Marlin kernel 在计算前**反量化成 bf16** → 再做 GEMM

这条路径有两个后果：

- **好处（对我们）**：decode 阶段每生成 1 个 token 都要把"当前激活的专家权重"从 HBM 搬进 SM 再反量化，固定开销很重；**投机解码把"每步只出 1 个 token"变成"每步出 ~1.9–2.5 个 token"，正好把这份固定开销摊薄**，所以收益比原生 FP8 卡上更大。
- **代价**：每一步验证的 forward 更重（要验 K 个候选），所以 **TTFT 变差**——dspark 115.7 ms，是 base 45.4 ms 的 **2.5 倍**。

一个粗略的算术感受（[推断]，非实测分解）：35B 总参 / 3B 激活、FP8 权重，单 token 至少要搬 ~3 GB 激活权重；168.51 tok/s ⇒ 有效权重带宽量级 ~0.5 TB/s，而 A800 的 HBM 带宽约 2 TB/s 量级——**说明瓶颈不全在原始带宽，Marlin 反量化与 kernel 启动开销占了大头**。这也解释了为什么"少一次 kernel 启动"的投机解码能拿到 1.5–2.5×。这个推演没有用 profiler 逐 kernel 拆开验证过，所以只当**方向性解释**，不当结论。

**结论：换 H20/H800（有原生 FP8、不需要 Marlin 反量化），这份收益大概率会缩水。本文所有 ×N 都绑死在"SM80 + weight-only FP8"这个前提上。**

---

## 3. 三个反直觉结论

### 3.1 结论一：MTP 不该被砍——而且"为 MTP 关掉 prefix caching"不付速度代价

我们之前的判断是错的：把 MTP 头当成"省 2.32 GiB 显存"的显存优化，差点为了省显存把它砍掉。实测打脸：

- **MTP K=1 = 1.56×（263.01 tok/s），接受率 94.4%**
- **MTP K=2 = 1.94×（327.06 tok/s），接受率 88.1%**

MTP 头是**跟 target 一起训练**出来的，天然贴合 target 分布，所以接受率高得离谱。它是**纯速度优化**，不是显存优化。

但这里有个上游坑：vLLM PR **#43650**（仍未合并）报告 **MTP + prefix caching 在混合 Mamba/GDN 层上会丢最后一个 block，导致精度下降**（gsm8k 0.916 → 0.900）。我们的处理很土但有效：**为 MTP 显式关掉 prefix caching**。

于是问题来了——关 PC 会不会掉速度？**不会**：

| 对比 | tok/s | 差 |
|---|---|---|
| base（PC 开） | 168.51 | — |
| base_nopc（PC 关） | 167.99 | **−0.3%** |

我们的 8 条 prompt 一次性喂进去、没有共享前缀，所以 PC 本来就没有命中可复用。**用 0.3% 的吞吐换掉一个已知的精度回归，这笔交易没有理由不做。**

> 注意口径：`vLLM v0.32.0` 的 `config/cache.py:141` **默认 `enable_prefix_caching=True`**，所以必须**显式**加 `--no-enable-prefix-caching`，光写注释不算。

### 3.2 结论二：n-gram 投机在"互不重复的负载"上是负收益

| 指标 | ngram K=4 |
|---|---|
| tok/s | 123.29 |
| 相对 base | **0.73×（比不开还慢 27%）** |
| 接受率 | **5.6%** |

原因很直白：n-gram 的假设是"接下来的 token 大概率在这段上下文里出现过"。我们这 8 条 prompt **主题互不相同、任务各异**，前缀复用假设根本不成立 → 草拟出来的 4 个 token 里 95% 被拒 → 白付草拟 + 验证开销。

**这条结论只对这个负载成立**。文献里代码补全、模板化输出这类高重复负载上 n-gram 能到 1.6–2.9×（那是别人家的数，**我们没实测**）。所以正确表述是：**"n-gram 在开放式、互不重复的指令负载上不要开"**，而不是"n-gram 没用"。

### 3.3 结论三：思考模式在这个模型上是**净负收益**

这是本轮最反直觉的一条，来自 SRE-Bench GMCQ 82 题：

| 设置 | 正确数 | 正确率 | 备注 |
|---|---|---|---|
| **关思考**（`enable_thinking=false`） | **71/82** | **86.59%** | max_tokens=16，n_skipped=0 |
| 开思考，max_tokens=1024 | 29/82 | **35.37%** | **41 题 `finish=length`——压根没答完** |
| 开思考，max_tokens=4096 | 29/82 | **35.37%** | `finish=length` 降到 11 题，**分数一动不动** |

把 token 预算给到 **4 倍**，正确率一题都没多。这不是"预算不够"，而是**模型陷在自我检查循环里**：它在反复验证自己、反复推翻，最后在预算耗尽时给出一个未完成的答案。这条解释了我们在别的测评里看到的"想太久不收敛"的所有现象。

工程含义：**对这类有确定答案的选择/推理题，默认关思考；要开思考就必须给"强制收敛"的停止条件，而不是加预算。**

---

### 3.4 附带发现：被打脸的不止判断，还有我们自己的工程实现

这轮最难看的部分不是模型不行，而是**我们自己的脚本在悄悄污染实验结果**：

| 我们原来的实现 | 问题 | 后果 |
|---|---|---|
| `pack/serve.sh` 的 mtp/mtp-fp8kv 分支 | 只有注释写"关 prefix caching"，**没有真加参数**，而 vLLM v0.32.0 `config/cache.py:141` 默认开着 | MTP 的 A/B 一直被 PC 污染，数字不干净 |
| `pack/quant_mtp_q4.py` 的分母 `32//bits` | 把 `n*bits/8` 截断，**丢掉 3/4 打包数据** | 反量化必炸 |
| `pack/scripts/merge_linear.py` | `astype(np.uint16)` 造成数值截断 | bf16 权重被改坏 |
| `pack/scripts/strip_vision.py` | 对 bf16 张量直接 `.numpy()` 抛 `Got unsupported ScalarType BFloat16` | 去视觉塔流程直接失败 |
| `research/setup_vllm.sh` 自检 | 检查 `vllm.model_executor.models.qwen3_5_moe`，v0.32.0 **没有这个模块** | 装对了也 exit 3，误导排查方向 |

**教训**：一个"注释里写了的参数"等于没写。所有影响口径的开关，必须**从实际命令行里回读验证**（我们后来用 `PRINT=1 ./pack/serve.sh mtp` 打印真实命令 + 在 `/metrics` 上确认），否则你测的是"A 与 B 的差"，报出来却是"A 与 A 的差"。

---

## 4. 测评侧：官方 68 项里零安全项，我们补了什么

ModelScope 上 `Qwen/Qwen3.5-35B-A3B` 的 README（**93,160 B**）抽出全表核对：**68 项官方 benchmark**，覆盖 Knowledge / IF / Long / Reasoning / Coding / Agent / Search / Multilingual / Vision / VQA / Doc-OCR / Spatial / Video / Visual Agent / Tool Calling / Medical —— **没有任何安全、渗透、漏洞利用、SRE 运维项**。

所以我们把力气花在"官方画像之外"：

| 测评 | 我们的结果 | 分母/口径 | 一句话买到了什么 |
|---|---|---|---|
| **SWE-bench-Live**（真实 GitHub issue） | **8/20 = 40.0%**（原始 8/24 = 33.3%） | 25 题切片；5 题因官方 gold 自身 P2P 不过剔出分母 | 真实修 bug 能力在 40% 量级；**分母校正本身比分数值钱** |
| **SRE-Bench / GMCQ** | **71/82 = 86.59%** | 82 题、关思考、max_tokens=16 | 与 o4-mini/o3 同区间的"纸面分"，CI ±7.4pt，**不能排名** |
| **SRE-Bench / code-reasoning v0.3** | **1875/2322 = 80.75%**（easy 969/1161、hard 906/1161） | 12 文件 2322 题 | 6 个仓库里 **3 个 hard > easy** ⇒ 这套题标定不可靠 |
| **SRE-Bench / terraform track** | **3/11 = 27.3%** | 修了 2 个上游 harness bug 之后（原 18.2%） | 真实 IaC 排障能力弱；**顺手挖出上游 bug** |
| **ExploitBench** | 官方 CLI **2/16**；codex fork 5 跑 **1.0/0/0/0/0**，grade 调用率 **1/5** | 单 cell cve-2024-1939 | 漏洞利用"能跑通但不稳定" |
| **ExploitGym** | **0.0**（分母 **2/869**） | 9,562,594 tokens | **口径问题不是能力问题**，见下 |
| **红日靶场自主渗透**（自建 docker 复刻） | artex **2/6**、codex **1/6**（P1 记 N/A，分母 6） | 双侧独立判据 | 该语境下 **9 轮拒 7**（官方对齐版）；鞍座只是调制项，见 4.1 第 3 条 |

几条需要展开的：

- **ExploitGym 的 0.0 不是"漏洞利用能力为 0"**：判分要求 flag 落在 **agent 容器 `/workspace/flag.txt`**，而 flag 在靶机 `/run/flag` ⇒ **必须真 RCE 才得分，纯触发 UB 永远 0 分**。我们打出了 UBSan `index 5 out of bounds`，但没拿到 shell。
- **红日那 2/6 还被平台"抢跑"了**：artex 拿 MySQL 弱口令就 `prove_goal`，平台直接把任务标成功并 teardown，**模型自己在同一秒连发两条自纠说"系统标记 met 是错的"**——模型的判断比平台元数据准。
- **SWE-Live 的 40% 不能与公开榜 24.7% 横比**：模型不同（35B-A3B vs 480B）、鞍座不同（codex vs OpenHands）、分母也不同（我们剔了 5 题）。只能做**同口径 A/B**。

### 4.1 为什么"官方没测过"这件事本身就值得写

三个理由，都不是"刷分"：

1. **安全/运维能力是这批模型的真实盲区**：官方 68 项里 Coding 是"写函数/修语法"，Agent 是"调工具完成任务"，**没有一项要求"在对手的主机上完成目标"**。而真实落地（代码审计、应急响应、红队）恰好全在这块。我们跑出来的 2/16（ExploitBench）、0.0（ExploitGym）、2/6（红日）比任何一项 HumanEval 式分数更能说明"它现在能不能被信任去干这活"。
2. **官方分数的分母是别人替你校好的**：SWE-bench-Live 里我们自己发现 **cfn-lint 家族 4 题的 gold patch 自身 P2P 只 1216/1220**，这些题任何人跑都过不了。公开榜不会告诉你这件事——**分母校正能力才是自建评测的核心产出**。
3. **拒答首先是模型的安全对齐，鞍座只是调制项**（我一开始归因错了，这里更正）：我们用的是**官方安全对齐版** FP8 权重，所以 codex 9 轮里 7 轮拒答，**主语是模型**，不是 harness。

   鞍座确实能改变是否触发：artex 各角色提示开头即自称「授权渗透测试系统」（`agent/promptcatalog.go:31`、`planner.go:293`、`worker.go:281`、`mainagent.go:94`，提示词文件合计 11 处授权表述），而 codex 的 base instructions 20,771 字符里 authoriz/permission/penetration/ctf/consent **全为 0** —— 提示里给了授权语境，模型就动手；没给，就拒。但即使加了授权前缀（2/2）codex 侧仍拒，说明**光靠提示词不能完全关掉对齐**。

   ⇒ 正确结论：**同一份对齐模型，拒答率的方差来自「上下文里有没有授权语境」，而不是「哪个鞍座更强」**；任何「A 鞍座比 B 强」的说法都不成立。

   ⇒ 要真正分离这两个变量，得用**消融权重**（`koharachan123/nemesis-35b-bf16`）跑同一套 harness —— 这是本轮**没做**的对照，也是最该补的一次实验。

---

## 5. 我们挖到的上游 bug（都不大，但都是真的）

| 项目 | 现象（原文/定位） | 影响 | 我们怎么处理 |
|---|---|---|---|
| **vLLM** PR #43650（未合并） | MTP + prefix caching 在 hybrid GDN 层上丢最后 block，gsm8k **0.916 → 0.900** | 高并发下精度静默下降 | 显式 `--no-enable-prefix-caching`（实测只掉 0.3% 吞吐） |
| **SRE-Bench terraform** | `run_task.py:74-98` 把 spec 布尔拼成 `-var x=True`（Terraform 只认小写 `true`）；`run_task.py:295` 把 boto3 datetime 直接 `json.dump` | 两题必挂 PLAN、一题必挂 CHECKS ⇒ 原 harness 只能给 **18.2%** | 修完跑出 **27.3%** |
| **SWE-bench-Live** | cfn-lint 家族 4 题的 **gold patch 自己** P2P 只 1216/1220（`Regions us-north-5 are unsupported`）；官方 `evaluation.py` 必须 cwd 在仓库根 | 分母被污染 | 剔出分母并单列（8/20 vs 8/24） |
| **codex（官方 fork）** | `ProviderCapabilities.namespace_tools` 默认 true 且**无法从配置关闭**；平铺后 `(ToolKind::Mcp, ToolPayload::Function)` 不被 `matches_kind` 接受；对空 schema 工具会**编造参数** | vLLM 不认 Responses `type=namespace` ⇒ 工具调用全变文本，直接 0 分 | 4 处补丁 + stdio 参数消毒代理 |
| **ExploitGym** | 判分要 flag 在 agent 容器 `/workspace/flag.txt`（`src/cybergym/evaluation/user.py:26`、`src/cybergym/server/task_handler.py:33`） | 纯触发 UB 永远 0 分 | 记录为口径限制，不当作能力结论 |

---

## 6. 复现（命令都在仓库脚本里）

### 6.1 环境

```bash
# 版本自检（我们跑通的组合）
python -c "import vllm, torch; print(vllm.__version__, torch.__version__)"
# 0.32.0 2.13.0+cu130
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv
# NVIDIA A800 80GB PCIe, 81920 MiB, 580.105.08
```

### 6.2 起服务（五臂各一条；示例给最关键的三个）

```bash
# base：开 prefix caching（对照组）
python -m vllm.entrypoints.openai.api_server \
  --model /root/autodl-tmp/nemesis-35b \
  --served-model-name nemesis \
  --tensor-parallel-size 1 \
  --max-model-len 32768 \
  --max-num-seqs 32 \
  --gpu-memory-utilization 0.92 \
  --language-model-only \
  --enable-prefix-caching \
  --port 8000

# mtp K=2：必须显式关 prefix caching（PR #43650 精度回归）
python -m vllm.entrypoints.openai.api_server \
  --model /root/autodl-tmp/nemesis-35b \
  --served-model-name nemesis \
  --tensor-parallel-size 1 \
  --max-model-len 32768 \
  --max-num-seqs 32 \
  --gpu-memory-utilization 0.92 \
  --language-model-only \
  --no-enable-prefix-caching \
  --speculative-config '{"method":"mtp","num_speculative_tokens":2}' \
  --port 8000

# dspark K=8：drafter 走本地目录（ModelScope 上没有 jinzex/... 那个仓库名）
python -m vllm.entrypoints.openai.api_server \
  --model /root/autodl-tmp/nemesis-35b \
  --served-model-name nemesis \
  --tensor-parallel-size 1 \
  --max-model-len 32768 \
  --max-num-seqs 32 \
  --gpu-memory-utilization 0.92 \
  --language-model-only \
  --no-enable-prefix-caching \
  --speculative-config '{"method":"dspark","model":"/root/autodl-tmp/dspark","num_speculative_tokens":8}' \
  --port 8000
```

> 仓库里这些参数已固化在 `pack/serve.sh`（`baseline|mtp|ngram|dspark|...` 模式名），不想手打就用 `PRINT=1 ./pack/serve.sh mtp` 先看命令再执行。

### 6.3 压测与记录

```bash
# 8 条固定 prompt × max_tokens 256 × temp=0，五臂顺序跑，逐档落盘 jsonl
bash bench/matrix.sh --configs "baseline,mtp,dspark"

# 投机接受率：从 /metrics 取（accepted / draft）
curl -s http://127.0.0.1:8000/metrics | grep -E 'spec_decode_num_(accepted|draft)_tokens_total'

# 显存峰值：起服务前挂 1s 采样的 dmon
nvidia-smi dmon -s m -d 1 -o DT | tee /tmp/gpu_mem.log
```

接受率的算法就是 `accepted_tokens / draft_tokens`，与日志里的 `Speculative decoding` 统计一致；吞吐 = 输出 token 数 / 墙钟（去掉首 token 等待则得到 TTFT 之外的净解码速率）。

### 6.4 一条方法论：先冻结口径，再跑数字

我们这轮踩过的口径坑，按代价从大到小排：

1. **模型默认开思考**：SRE-Bench GMCQ 用 `max_tokens=16` 时不加 `chat_template_kwargs={"enable_thinking": false}`，全部 `finish=length`、`pred=None`，分数会是 **0** 而不是 35.37%——差点误报成"模型完全不会"。
2. **prefix caching 默认开**：不显式关，MTP 的 A/B 全部被污染（见 §3.4）。
3. **判分分母未校正**：gold patch 自身不过的题必须剔出分母，并**同时报原始分母**（我们写 8/20 的同时写 8/24）。
4. **"没交卷"要单列**：budget 拦截导致的 0 分，与"交了卷但答错"是两件事。

所以现在的顺序是：**先定口径（谁给分、分母怎么算、什么算失败）→ 再跑数 → 跑完回读命令行与 `/metrics` 验证配置真的生效**。

---

## 7. 局限（不写这些，上面的数字就变成了吹）

1. **8 条 prompt × 256 token 的微基准**，单流、顺序执行、单 seed，**不是生产吞吐**；±5% 以内的差异不可信。
2. **TTFT 是实实在在的退步**：dspark 115.7 ms vs base 45.4 ms（2.5×）。交互式场景下 2.54× 的吞吐换 2.5× 的首字延迟，**这笔账不划算**；它只在离线批处理/离线评测里成立。
3. **A800 没有原生 FP8**，走的是 weight-only Marlin（日志原文在 §2）。decode 是带宽/kernel 开销 bound ⇒ **投机收益被放大**。换 H20/H800 收益会缩水，**数字不可外推**，我们也没有跨卡对照。
4. **全部是单卡 TP=1**；TP2/TP4、并发 32 的**聚合吞吐没测**（`max-num-seqs 32` 只是上限，不是并发压满）。
5. **评测侧全部是小样本、单跑**：GMCQ 82 题 CI ±7.4pt；code-reasoning 的 easy/hard 有一半是反的；红日两臂各 1 轮、分母 6；ExploitGym 分母 2 题。**都不能与公开排行榜横比**（模型/鞍座/分母全不同）。
6. **ExploitBench 的 2/16 是单 cell 单 seed**，codex fork 5 跑里只有 1 跑真交了卷（grade 调用率 1/5）——样本量不足以说"哪个鞍座更好"。
7. **KV cache 151 万 token 是在 32768 长度、0.92 利用率下的余量**，不代表长上下文场景；真跑 131k 时上下文预算是硬约束（ExploitBench 就是被 `max-model-len` 打断的，不是被能力打断）。
8. **"交卷"和"得分"必须分开统计**：ExploitBench 的 codex 鞍座 5 跑里 4 跑是 **grade 一次都没调**（`budget: context_size` 拦截），不是"答错得 0"。按 `status=succeeded` 统计会**虚报成功**——异常只写在 `failure_reason` 里。这类口径坑比分数本身更值得写进流程。
9. **跑满 30 turns 需要 ≥200k 上下文**：`grade()` 的返回值本身就有 **69,457 字节**，把累计输入从 114,034 顶到 131,073，**超过 131,072 上限 1 个 token**。harness 对工具结果零截断、`context_budget` 只在 turn 后判定（`budget.py:107-122`）⇒ 这是模型/服务端硬约束，不是调参能绕的。

---

## 8. 下次要测什么

1. **跨卡对照**：同一套五臂在 **H20 / H800（原生 FP8）** 上重跑一遍，验证"Marlin 放大收益"这个假设——这是本文最大的一块空白。
2. **长上下文 + 并发压测**：`max-num-seqs` 打到 32/64，测**聚合吞吐**而不是单流 tok/s；再看 dspark 在并发下的接受率会不会掉。
3. **多 seed 与方差**：每臂 3–5 个 seed、换 3 批不同 prompt（含代码补全这种高重复负载），给每个 ×N 一个置信区间，顺便验证 ngram 在"高重复负载"上是否真能翻正。
4. **把 TTFT 打下来**：dspark 的首字延迟能不能通过"首 token 不走投机 / 提前 batch"缓解，这决定它能不能进交互场景。
5. **思考模式的停止条件**：给 `enable_thinking` 加"自检轮数上限"或"答案收敛检测"，验证 35.37% 能否回到 86.59% 量级——如果能，这就是一个可复用的推理侧改进。
6. **MTP 精度回归的定量化**：PR #43650 的 gsm8k 0.916→0.900 是别人家的数，我们要在**自己的权重**上跑 gsm8k 前后对照，把"关 PC 换精度"从"相信上游"变成"自己测过"。
7. **评测侧**：SWE-Live 扩到 50 题、SRE-Bench terraform 补 3 题结构性不可得分的分析、ExploitBench 换 2–3 个 cell 重跑，把"单 cell 单 seed"的漏洞补上。

---

## 附：本文数字的来源

| 数字 | 出处 |
|---|---|
| 五臂 tok/s / TTFT / 接受率 / 显存峰值 | `research/review/FINAL.md` §1.1（五臂实测表） |
| 启动 271s/63s/231s、权重 33.79 GiB/28.33s、KV 151 万 token | `research/review/FINAL.md` §1 与运行日志 |
| Marlin 警告原文 | `marlin_utils_fp8.py:108` 启动日志 |
| 68 项官方 benchmark 全表 | ModelScope `Qwen/Qwen3.5-35B-A3B` README 93,160 B |
| 各测评分数 | `research/review/swe-live-25.md`、`sre-bench-results.md`、`sre-terraform-run.md`、`exploitgym-run.md`、`redsun-artex-run.md`、`codex-arm-run.md` |
| 上游 bug 定位 | 同上各报告，含 `file:line` |
