---
title: "在 CentOS 7 上安装 Java 24：一份未完成教程的整理版"
published: 2025-04-22
updated: 2025-06-22
draft: false
description: "记录在 CentOS 7 上下载并安装 Oracle JDK 24 RPM 的过程，同时说明 CentOS 7 已停止维护、Java 24 的依赖风险，以及安装后的验证和切换命令。"
image: /upload/image-VbxY.jpg
tags: ["服务器", "教程", "CentOS", "Java"]
category: 外版
comment: true
---

这篇原本只写到 `wget` 下载文件，后面的安装和验证没有补完。这里把当时的步骤补齐，同时把一个很重要的前提放在最前面：**CentOS 7 已经 EOL，不适合新部署；Java 24 也不是长期支持版本。** 如果只是维护旧机器，可以按本文操作；新服务更建议迁移到 Rocky Linux、AlmaLinux、Oracle Linux 或 Debian，并使用仍在支持周期内的 JDK。

## 下载安装包

从 [Oracle Java Downloads](https://www.oracle.com/java/technologies/downloads/) 找到 Linux x64 RPM。Oracle 下载页面可能要求登录或接受许可，实际下载地址以当前页面为准。

![Oracle JDK 下载页面](/upload/image-VbxY.jpg)

当时使用的命令是：

```bash
wget https://download.oracle.com/java/24/latest/jdk-24_linux-x64_bin.rpm
ls -lh jdk-24_linux-x64_bin.rpm
```

![下载完成后的文件](/upload/image-wIST.jpg)

不要只看文件名，先确认它确实是 RPM，而不是下载失败后保存下来的 HTML：

```bash
file jdk-24_linux-x64_bin.rpm
rpm -K jdk-24_linux-x64_bin.rpm
```

如果 `file` 显示 HTML，或者 `rpm -K` 校验失败，先删掉文件重新下载，不要继续安装。

## 安装和卸载

CentOS 7 自带的 `yum` 可以处理本地 RPM 依赖：

```bash
sudo yum localinstall ./jdk-24_linux-x64_bin.rpm
```

也可以使用 rpm：

```bash
sudo rpm -ivh ./jdk-24_linux-x64_bin.rpm
```

如果提示缺少依赖，优先用 `yum localinstall`，不要随便从不明网站下载同名 `.so` 文件。Java 24 的 RPM 可能依赖较新的 glibc 或系统组件；CentOS 7 的旧用户态不一定能满足，遇到依赖冲突时迁移系统通常比强行覆盖库安全。

查看安装结果：

```bash
rpm -qa | grep -i '^jdk\|^java'
java -version
javac -version
```

卸载时先确认包名：

```bash
rpm -qa | grep -i jdk
sudo yum remove jdk-24
```

包名可能随 Oracle 的发行方式变化，以 `rpm -qa` 的实际输出为准。

## 设置 JAVA_HOME

如果 `java -version` 已经正确，但某些服务仍然找不到 Java，配置 `JAVA_HOME`。先找真实安装路径：

```bash
readlink -f "$(command -v java)"
```

假设路径位于 `/usr/lib/jvm/jdk-24`，可以创建 `/etc/profile.d/java24.sh`：

```bash
sudo tee /etc/profile.d/java24.sh >/dev/null <<'EOF'
export JAVA_HOME=/usr/lib/jvm/jdk-24
export PATH="$JAVA_HOME/bin:$PATH"
EOF

source /etc/profile.d/java24.sh
java -version
echo "$JAVA_HOME"
```

如果服务器上同时有多个 JDK，可以用 alternatives 切换：

```bash
sudo alternatives --config java
sudo alternatives --config javac
```

服务由 systemd 启动时不会读取当前用户的 shell 配置，应该在 unit 文件里用 `Environment=JAVA_HOME=...`，或者直接使用 JDK 的绝对路径。

## 常见问题

- **下载地址返回 404**：Oracle 会调整 `latest` 路径，回到官方页面重新复制，不要一直重试旧链接。
- **`rpm -K` 失败**：大概率是下载到 HTML、下载中断或代理替换了内容。
- **缺少 glibc / libstdc++**：这是 CentOS 7 用户态过旧的信号，优先换到仍受支持的发行版。
- **`java` 还是旧版本**：检查 `command -v java`、`readlink -f` 和 alternatives，不要只重复安装。
- **系统服务启动失败**：查看 `journalctl -u 服务名 -e`，确认 systemd 的环境变量和运行用户。

这篇记录更适合当作旧服务器迁移前的备忘，而不是新服务器的推荐方案。安装成功只是第一步，操作系统和 JDK 的支持周期同样需要纳入维护计划。
