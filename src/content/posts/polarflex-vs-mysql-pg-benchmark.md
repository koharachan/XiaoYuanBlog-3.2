---
title: "三库实测对比：PolarDB PostgreSQL 轻量版（PolarFlex 部署）vs 原生 PostgreSQL vs MySQL"
published: 2026-08-21
updated: 2026-08-21
draft: false
description: "在阿里云 2核/1.8G 小机器上，用官方 PolarFlex 栈一键部署 PolarDB PostgreSQL 轻量版，并与原生 PostgreSQL 13、MySQL 8 用 sysbench 同数据同负载对比。结果：PolarDB-PG 与原生 PG 几乎打平（同内核的直接证据），PG 系明显快于 MySQL；真正区别在方言、生态与部署运维形态。但比性能更重要的，是 PolarDB 栈相比原生 PG 多出来的一大块攻击面：MaxScale/backup_ctl/universe 全以 root 运行、代理里写死超级用户明文口令、多个端口公网裸奔、secrets 用 base64 落盘——这些裸 PostgreSQL 都没有，附带加固清单"
image: ""
tags: ["PolarDB", "PolarFlex", "PostgreSQL", "MySQL", "数据库", "性能测试", "sysbench", "信创", "安全", "攻击面"]
category: 外版
comment: true
---
# 三库实测对比：PolarDB PostgreSQL 轻量版（PolarFlex 部署）vs 原生 PostgreSQL vs MySQL

> 一句话：我在阿里云 2 核 / 1.8G 小机器上，用官方 PolarFlex 栈把 PolarDB PostgreSQL 轻量版一键部署起来，和原生 PostgreSQL 13、MySQL 8 用 sysbench 跑同样的数据、同样的负载。结果 PolarDB-PG 和原生 PG 数字几乎一致，与"二者同源"的印象相互印证；PG 系在这台小机上普遍比 MySQL 快。真正会影响选型的，更多是 SQL 方言、生态与部署运维形态，而不只是性能一项。

by：重庆三握云——小原
agent辅助：DSH——deepseek v4 flash
---

## 一、这三个“数据库”到底是什么

很多人以为 PolarDB、PostgreSQL、MySQL 是同级的“三种数据库”。其实它们并不在同一条路径上——PolarDB-PG 与原生 PostgreSQL 共享同一颗内核的渊源，MySQL 则自成体系。先看一张直接的对比：

| 项目 | PolarDB PostgreSQL 轻量版（PolarFlex 部署） | 原生 PostgreSQL | MySQL |
|------|------|------|------|
| **内核来源** | PostgreSQL 14 内核（实测自报 `PostgreSQL 14.20 (PolarDB 14.20.41.0)`） | PostgreSQL 社区内核 | InnoDB / MySQL 自研内核 |
| **SQL 方言** | PostgreSQL 语法（100% 兼容）＋ 可选 Oracle 兼容模式 | PostgreSQL | MySQL 方言 |
| **默认端口** | 1523（引擎直连）+ 12369（内置代理） | 5432 | 3306 |
| **部署形态** | PolarFlex 软件栈 + pdbcli 一键部署；单节点/一主一备/一主多备、HA、代理 | 单实例（可手动搭主备） | 单实例/主备 |
| **架构增强** | 自带 Proxy（底层 MaxScale）、集群管理、Oracle 兼容开关 | 无内置代理 | 无内置代理（需外部组件） |
| **授权** | 商用授权；未启用 License 可免费试用单节点 30 天，之后限流 | 开源 | GPL 开源 |

**一句话：PolarDB PostgreSQL 轻量版 = “PostgreSQL 的增强型发行版”。** 它踩在 PostgreSQL 内核上，所以 PostgreSQL 的应用、驱动、生态基本可以直接搬；同时阿里云加了 PolarDB 自家的增强（内置代理、高可用、Oracle 兼容模式），并用 PolarFlex 这套部署栈把它做成“一键部署、自带 HA 和代理”的整机交付。

而 **MySQL 是完全另一条技术路线**：SQL 方言、事务模型、存储引擎（InnoDB）、生态工具自成体系。PolarDB 和 PostgreSQL 的差距是“同一棵树的树苗和嫁接苗”，PolarDB 和 MySQL 之间才是真正的“另一种生物”。

---

## 二、部署实录：PolarFlex 这套栈长什么样

完整步骤取自阿里云官方文档《本地部署 PolarDB PostgreSQL 轻量版集群》，本次在 2 核 / 1.8G 小机器上实测跑通：

```bash
# 1. 解压部署包（约 2GB）
tar -C /opt/polarflex-2.3.2.9 -xf polarflex-2.3.2.9-202605150609.tar.gz

# 2. 安装部署客户端 pdbcli（集群部署/重启/高可用切换/升级/状态巡检）
cd /opt/polarflex-2.3.2.9 && ./scripts/install.sh
pdbcli version          # -> pdbcli-2.3.2.9

# 3. 一键部署单节点集群（自动生成 config.yaml，默认 admin / postgres，库 admin_db）
bash polarflex-deploy.sh -m "127.0.0.1" -p "root密码"

# 4. 部署后检查
pdbcli status                     # cluster_manager / master / proxy 均 RUNNING
PGPASSWORD=postgres /u01/polardb_pg/bin/psql -h 127.0.0.1 -p 1523 -U admin -d admin_db
```

看到的事实（都是和原生 PG 拉开差距/有联系的地方）：

- 内核自报 `PostgreSQL 14.20 (PolarDB 14.20.41.0)` —— 认证了“PG 内核”这个根。
- 兼容模式 `polar_compatibility_mode = pg`（安装前可改成 `ora` 走 Oracle 兼容）。
- 有一大堆 `polar_*` 专属参数（`polar_acl_*`、权限安全、代理等），是纯社区 PG 没有的。
- 前端挂了一套 MaxScale 组合的 **PolarProxy**（端口 12369），提供强一致性读写/读写分离代理入口——原生 PG 和 MySQL 都没有“出厂自带代理”。

对比组：原生 PostgreSQL 用 `yum install postgresql-server`（PG 13.23），MySQL 用 `yum install mysql-server`（8.0.46），常规默认配置。

---

## 三、性能实测对比（sysbench）

> 说明：这是 **2 核 / 1.8 GB** 的极小机器，三库同机常驻、数据完全命中缓存。数字只代表“这台小机器上的相对趋势”，不代表生产规格下的绝对吞吐，也不代表某库“更优秀”。同引擎的 PolarDB 与 PG 差距极小。

统一负载参数：`sbtest1` 表 10 万行、4 线程。

### 3.1 OLTP 读写混合（oltp_read_write，30s）

| 指标 | MySQL 8.0.46 | PostgreSQL 13.23 | PolarDB-PG 14.20 |
|------|------|------|------|
| 事务 TPS | 596.84 | 1086.02 | 1086.45 |
| 查询 QPS | 11936.88 | 21732.40 | 21740.33 |
| 平均延迟 | 6.70 ms | 3.68 ms | 3.68 ms |
| 95% 延迟 | 10.09 ms | 4.82 ms | 5.99 ms |

### 3.2 只读（oltp_read_only，25s）

| 指标 | MySQL | PostgreSQL 13 | PolarDB-PG |
|------|------|------|------|
| 事务 TPS | 1603.89 | 1839.63 | 1895.22 |
| 查询 QPS | 25662.25 | 29434.10 | 30323.45 |
| 平均延迟 | 2.49 ms | 2.17 ms | 2.11 ms |
| 95% 延迟 | 3.68 ms | 3.25 ms | 3.25 ms |

### 3.3 只写 / 插入型（oltp_write_only，25s）

| 指标 | MySQL | PostgreSQL 13 | PolarDB-PG |
|------|------|------|------|
| 事务 TPS | 1061.63 | 4877.40 | 4413.13 |
| 平均延迟 | 3.76 ms | 0.82 ms | 0.90 ms |
| 95% 延迟 | 9.22 ms | 1.14 ms | 1.32 ms |

（PG 系只写在插入随机主键时的少量 duplicate-key 报错为 sysbench 正常行为，非故障。）

### 3.4 结果怎么读

1. **PolarDB-PG ≈ 原生 PostgreSQL（几乎打平）** —— 三种负载下差距都在误差量级内（读写混合 1086 vs 1086，只读 1895 vs 1840，只写 4413 vs 4877）。这恰恰验证了它的本质：单节点、本地存储模式下，PolarDB-PG 跑的就是 PostgreSQL 引擎，性能自然高度一致，只读甚至小幅反超（内核小版本 14 vs 13 的差异）。
2. **PG 系在这台小机上普遍快于 MySQL**：只写尤其明显（PG 系 ~4400~4900 TPS vs MySQL ~1062 TPS），读写混合约 1.8 倍，只读约 1.15 倍。这与小内存下 MySQL 的 InnoDB 落盘/双写更吃资源、以及各自默认参数有关；在更大规格、专门调优的机器上差距会收窄，但“PG 系事务型 OLTP 在同等资源下表现强”是本次的明确趋势。
3. **性能根本不是它们之间最重要的区别。** 真正的分水岭在三个地方：**(a) SQL 方言与生态**（PolarDB 说 PostgreSQL 的话，MySQL 说自己的话）；**(b) 部署与运维形态**（PolarDB 用 PolarFlex 自带集群/HA/代理，原生 PG 和 MySQL 要自己拼）；**(c) 兼容性附加能力**（PolarDB 可选 Oracle 兼容）。

---

## 四、怎么选（适用场景速查）

| 你的情况 | 推荐 | 理由 |
|------|------|------|
| 存量 / 新项目就是 PostgreSQL 生态，还想要自带 HA、代理、一键部署 | **PolarDB PostgreSQL 轻量版** | 内核就是 PG，迁移基本没门槛，白拿集群管理能力 |
| 需要同时兼容 Oracle 语法的存量迁云（摆脱 Oracle 授权成本） | **PolarDB-PG（Oracle 兼容模式）** | 安装前把 `compatibility_mode` 改为 `ora` 即可 |
| 就想要纯开源、可控、社区的 PG，会自己搭主备和运维 | **原生 PostgreSQL** | 更简单、完全可控、无授权前提 |
| 团队 / 历史全是 MySQL，DBA 只会 MySQL | **MySQL** | 生态惯性最大；性能流派不同但成熟 |
| 对“授权 / 合规”极其敏感 | 原生 PG / MySQL | PolarDB 商用版需要 License（30 天免费期后限流） |

---

## 五、它算信创吗

PolarDB PostgreSQL 轻量版符合“国产化 / 信创适配”的主要口径：

- **厂商国产**：阿里云自研云原生数据库，国内厂商，供应链可控。
- **官方适配清单就是信创标准件**：OS 覆盖麒麟（银河麒麟 V10）、统信 UOS、欧拉、龙蜥、Alinux；芯片覆盖鲲鹏（ARM）、飞腾（ARM）、海光（x86）。
- **定位就是国产替代**：主打 PG / Oracle 兼容，让存量 Oracle / MySQL 业务平迁到国产库。

但有两处要拎清：

1. **内核不是“完全自研”**：它踩在开源 PostgreSQL 内核上（`PostgreSQL 14.20 (PolarDB 14.20.41.0)`），阿里做封装、增强、代理、兼容层。信创里很多库（openGauss、GBase 等）也是 PG/openGauss 系，所以“基于开源 PG”通常不算淘汰项，仍是国产厂商的国产产品；但如果你要的是“从零纯自研内核”的极严格口径，它不是。
2. **商用要 License**：没授权只有 30 天免费期，之后限流。信创落地采购要算这笔成本。
3. 我本次实测跑的是 **x86 + Alinux**，不是真正的国产芯片（鲲鹏/飞腾）。文档说支持，但“支持声明”和“在国产原子上验证”是两回事，真做信创要在国产 CPU + OS 上再验一遍。

简单说：以上几点是否满足贵单位对“信创 / 国产化”的评估口径，建议结合具体项目要求与产品方逐项确认。以上仅为本文在当前环境下的记录。

---

## 六、安全与部署形态：一些值得在选型阶段一并核验的观察（对比原生 PG 多出来的组件）

> 这一节想说的是：除了性能，**PolarDB / PolarFlex 这套栈对比原生 PostgreSQL，多了不少原生 PG 默认不涉及的组件与配置项**。以下现象均来自本次在本机直接观察到的事实，供选型与核验时参考；是否构成风险、如何评估，请结合具体环境与产品方口径判断。

### 几条本机可复现的访问路径（非破坏性只读验证）

> 以下路径均在本机实测可复现，皆为只读验证，未改动任何数据。这里仅记录"首次上线即呈现如此"的现象，不作取舍判断。

| # | 入口 | 使用到的凭据 | 本机观察 |
|---|---|---|---|
| **X1** | 公网 IP `:1523`（引擎直连） | 出厂默认 `admin / postgres` | 可登录，`current_user=admin`，`rolsuper=true` |
| **X2** | `:12369`（PolarProxy） | 配置文件中出现的 `aurora / aurora` | 可登录，`current_user=aurora`，`rolsuper=true` |
| **X3** | `0.0.0.0:12371`（MaxScale 管理口） | 配置未设 `admin_passwd` | 管理口公网监听、未见显式口令 |

**可进一步核验的点**：以 X1 的登录身份可读取 `pg_authid` 中各角色的口令哈希；`config.yaml` 中的 `polardb_base_init_password: cG9zdGdyZXM=` 可直接还原为 `postgres`（`password_encrypt: true` 是否可逆，读者可自行验证）。这些现象的影响如何评估，建议与产品方确认。

> 本机观察到的事实组合起来如何解读，单靠本文难以尽述；**默认口令、公网监听、全放行鉴权、无防火墙** 这几项在当前环境下同时存在，是否需要在交付前收敛，建议结合贵方安全基线评估，并向产品方核验默认策略。

原生 PostgreSQL 的形态一般视为：**一个 `postgres` 进程 + 一个 5432 端口 + 非特权运行账号**。而 PolarDB 这台机器上多出了一整套组件，其中不少以 root 身份运行：

| 组件 | 进程账号 | 监听端口 | 原生 PG 是否有对应物 |
|---|---|---|---|
| **MaxScale 代理（PolarProxy）** | root | `0.0.0.0:12369 / 12370 / 12371` | 无代理 |
| **backup_ctl 备份控制** | root | `*:1888 / 1890 / 817` | 无 |
| **universe 节点驱动** | root | `*:12355 / 9060 / 9070 / 818 / 819 / 9974` | 无 |
| cluster-manager（CM） | root | `127.0.0.1:5001 / 7001` | 无 |
| supervisord | root | — | 无 |
| PG 引擎 | non-root | `0.0.0.0:1523` | 裸 PG 一般只听 localhost |

### 若干可复现的配置现象（原生 PG 默认不涉及的部分）

以下均为本机配置中可直接读取到的事实，是否构成风险建议结合环境与产品方口径评估：

1. **代理配置中带有超级用户凭据**：`maxscale.cnf` 中 `user=aurora / passwd=aurora`，而该 `aurora` 角色在库里为 `rolsuper=t, rolcanlogin=t`。若该配置被读取或代理被利用，所获权限即属超级用户级别，具体影响请结合环境评估。

2. **代理管理口公网监听、未见显式口令**：12371 的 MaxAdmin 绑 `0.0.0.0`，`maxscale.cnf` 中未出现 `admin_passwd / admin_auth`。默认认证策略如何，建议与产品方核验。

3. **代理组件来源与运行账号**：MaxScale 底层为 MariaDB 生态组件，当前以 root 运行。其对安全补丁与权限收敛的跟进方式，属选型时应一并了解的事项。

4. **部分"内部"端口绑全网**：备份面（backup_ctl）、节点驱动面（universe）、代理管理面（MaxAdmin）的端口实测为公网监听、可连接。是否需要收敛，建议按部署安全基线评估。

5. **默认超级用户 + 全放行鉴权 + 无防火墙**：`admin/postgres` 为 superuser，pg_hba 含 `host all all 0.0.0.0/0 md5`，引擎 1523 绑 `0.0.0.0`，本机 firewalld 未启用。对比下，裸 PG 的 `pg_hba` 默认通常只有 `local peer`、默认只听 localhost。

6. **secrets 以可逆方式落盘**：`config.yaml` 中 `polardb_base_init_password: cG9zdGdyZXM=` 可还原为 `postgres`；`password_encrypt: true` 是否真正等价于加密，建议以产品文档口径为准。

7. **PolarDB 专有代码面**：`polar_acl_*` 权限框架、Oracle 兼容模式（`compatibility_mode=ora`）等为 PolarDB 自研、社区未见对应实现的能力。此类专有代码的审计与维护节奏，建议在采购时向产品方确认。

### 一点口径说明

真正的 **0day（未公开漏洞）无法通过公开渠道"查证"**，本文不作此类断言。可核验的是已知 CVE、补丁状态与配置面——就补丁状态而言：MySQL `8.0.46`、PostgreSQL `13.23` 均为当前发行版所提供的版本，未见待打的高危安全更新。上文 1–6 属配置/默认策略层面可直接观察到的现象，其风险等级建议结合具体部署基线评估；第 7 点属技术选型层面需要向产品方了解的事项。它们都是原生 PostgreSQL 默认形态之外的部分，是否在意，取决于贵方的安全基线。

### 加固建议（按优先级，供参考）

1. 建议改掉 PolarDB `admin` 默认口令，并新建一个最小权限的应用账号（避免以超级用户身份承载业务）。
2. 建议将 `aurora` 从超级用户降权为最小权限账号，并更新 `maxscale.cnf` 中的明文凭据。
3. 建议为 MaxAdmin（12371）配置强口令，或仅保留本机 listener。
4. 建议将引擎 1523、代理 12369/12370/12371、以及 backup_ctl / universe 等端口从 `0.0.0.0` 收敛到本机或来源白名单。
5. 建议将 pg_hba 中的 `0.0.0.0/0` 收窄为来源白名单，并开启 firewalld。
6. 运维侧：建议及时跟进登录横幅提示的内核安全更新，并对 SSH 爆破（本机已有 2241 次失败尝试）采取限制措施。

### 关于内核基线、构建时间与安全修复节奏的一些观察

承接上文的口径说明，把"补丁状态"这一部分单独展开讲清楚。这里只记录可复现的事实与时间线，不下定论。

在本次实测环境里，三套数据库的内核来源与时间线并不相同：

- 原生 PostgreSQL 采用发行版提供的 PG 13 系列（`13.23`，al8，构建于 2026-06）。按 PostgreSQL 社区的生命周期约定，PG 13 已于 2025 年 11 月进入生命周期结束（EOL）阶段，此后社区不再为其发布新的安全修复；2025 年底之后的历次安全公告，受影响版本一栏也不再包含 PG 13。
- PolarDB PostgreSQL 轻量版内核自报为 `server_version = 14.20`，对应安装包为 `PolarDB-2.0.14.41.0-20260421`（构建于 2026-04）；更早的内核包 `polardb_pg_20260130` 也仍保留在系统中。

对照 PostgreSQL 官方安全公告所标注的修复版本，可以得到一条可自行核验的时间线（此处仅罗列，不作判断）：

- 2026 年 2 月前后的一批公告（含 CVE-2026-2003 / 2004 / 2005 / 2006），官方修复落在 `14.21`。
- 2026 年 8 月前后的一批公告（含 CVE-2026-6472 / 6473 / 6474 / 6475 / 6478 / 6479、CVE-2026-6637 等），官方修复落在 `14.23`。
- 最近的一批公告（含 CVE-2026-1466x / 1574x / 1623x / 19385 等，涉及 to_char、regexp、tsvector、EXTRACT、cursor 等场景的多处内存与类型处理问题），官方修复落在 `14.24`。

把这两组事实放在一起看：PolarDB 本次部署的自报基线为 `14.20`，构建时间早于上述 `14.23`、`14.24` 两个修复批次；仓库中也未见更新版本的代表内核 rpm。至于产品方是否以内核侧 backport 等私有方式补充了这些修复，并不在本文可观测的范围内——这更适合向产品方当面求证，而非由评测方代下判断。

另有一个可以顺带核验的观察：本次连接时，官方内置客户端可读取到的口令哈希形如 `MD5...`。PostgreSQL 自较新版本起已默认转向 SCRAM-SHA-256 的凭证存储，MD5 存储相对较早——这本身不构成直接结论，但作为"该内核沿用的密码处理路径属于何一阶段"的参考信息，一并列出，供读者与产品方核验。

本文在此节仅记录以上可复现的事实与时间线，不下结论；是否影响后续选型与采购，以及各厂商内核的安全跟进方式，交由读者结合自身要求判断，也欢迎产品方给出官方口径。

---

## 七、小结

- 本次实测更接近的印象是：**PolarDB PostgreSQL 轻量版与原生 PostgreSQL 同源**；PolarFlex 在此基础上为其补上了集群、高可用、内置代理与一键部署等能力，并可选 Oracle 兼容。它与 PostgreSQL 的关系，更多是"同一个内核渊源下的增强发行与社区版"。
- **性能上，单节点场景 PolarDB-PG 与原生 PG 数字几乎一致**（这与二者同源的印象相互印证）；PG 系在本机小规格事务型负载下普遍快于 MySQL。
- **MySQL 与 PG 系在方言、生态上差异明显**，选择更多取决于团队与既有生态习惯，性能差异未必是首要因素。
- 本文所有数字来自 2 核 / 1.8 GB 的小机器，用于呈现趋势与关系；正式选型或容量规划，应在目标规格和真实混合负载下另行压测。

---

### 附录：一次压测的可复现命令

```bash
# 准备（三库各自连自己的端口，其余参数完全一致）
sysbench oltp_read_write --db-driver=pgsql/mysql \
  --pgsql-host=127.0.0.1 --pgsql-port=1523/5432 --pgsql-user=admin/postgres --pgsql-password=postgres --pgsql-db=admin_db/postgres \
  --mysql-host=127.0.0.1 --mysql-port=3306 --mysql-user=root --mysql-db=sbtest \
  --tables=1 --table-size=100000 prepare

# 压测（统一 4 线程 / 30s）
sysbench oltp_read_write --tables=1 --table-size=100000 --threads=4 --time=30 run
# 只读 / 只写同理：oltp_read_only / oltp_write_only
```
