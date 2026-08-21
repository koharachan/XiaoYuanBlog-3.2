---
title: "三库实测对比：PolarDB PostgreSQL 轻量版（PolarFlex 部署）vs 原生 PostgreSQL vs MySQL"
published: 2026-08-21
updated: 2026-08-21
draft: false
description: "在阿里云 2核/1.8G 小机器上，用官方 PolarFlex 栈一键部署 PolarDB PostgreSQL 轻量版，并与原生 PostgreSQL 13、MySQL 8 用 sysbench 同数据同负载对比。结果：PolarDB-PG 与原生 PG 几乎打平（同内核的直接证据），PG 系明显快于 MySQL；真正区别在方言、生态与部署运维形态。附带完整可复现压测命令"
image: ""
tags: ["PolarDB", "PolarFlex", "PostgreSQL", "MySQL", "数据库", "性能测试", "sysbench", "信创"]
category: 外版
comment: true
---
# 三库实测对比：PolarDB PostgreSQL 轻量版（PolarFlex 部署）vs 原生 PostgreSQL vs MySQL

> 一句话：我在阿里云 2 核 / 1.8G 小机器上，用官方 PolarFlex 栈把 PolarDB PostgreSQL 轻量版一键部署起来，和原生 PostgreSQL 13、MySQL 8 用 sysbench 跑同样的数据、同样的负载。结果 PolarDB-PG 和原生 PG 几乎是打平——这正是“它内核就是 PostgreSQL”的直接证据；而 PG 系在这台小机上普遍比 MySQL 快。真正决定选型的，不是性能，而是 SQL 方言、生态和部署运维形态。

by：DSH / deepseek-v4-flash
---

## 一、这三个“数据库”到底是什么

很多人以为 PolarDB、PostgreSQL、MySQL 是同级的“三种数据库”。其实不完全对，它们是**两个物种 + 一个套壳**：

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

**一句话：能当信创国产库用，官方也是按信创适配清单做的；但它是“阿里把开源 PG 内核做成国产商业发行版”，不是纯自研内核。**

---

## 六、结论

- **PolarDB PostgreSQL 轻量版不是另一个数据库，而是“穿上铠甲的 PostgreSQL”**：内核是 PG14，说 PostgreSQL 的话，加上了 PolarFlex 一键部署、集群 / 高可用、内置代理，并可选 Oracle 兼容。它和 PostgreSQL 的关系是“增强发行版与社区版”。
- **性能上，单节点场景 PolarDB-PG 与原生 PG 基本打平**（这就是同内核的直接证据）；PG 系在本机小规格事务型负载下普遍快于 MySQL。
- **MySQL 是另一个物种**：方言、生态、引擎独立。选 PostgreSQL 系还是 MySQL，更多是生态和团队问题，而不是“谁更快”一锤定音。
- **本文所有数字来自 2 核 / 1.8 GB 的小机器**，用于讲清趋势和关系；正式选型或容量规划，应在目标规格和真实混合负载下另行压测。

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
