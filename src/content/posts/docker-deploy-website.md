---
title: "用 Docker 命令行部署 Nginx、PHP 和反向代理"
published: 2025-04-03
updated: 2025-04-04
draft: false
description: "从一个能长期维护的 Compose 示例开始，用固定版本镜像部署 Nginx 静态站、PHP-FPM 和 Halo 反向代理；修正容器网络、挂载路径、PHP location 和配置检查。"
image: /upload/image-nhAz.jpg
tags: ["Docker", "网站", "Nginx", "PHP", "服务器"]
category: 外版
comment: true
---

原稿是我早期用 `docker run` 部署网站时留下的笔记，里面有 `nginx:latest`、PHP 7.1、容器 IP 和几处写错的 Nginx 配置。照着旧版本直接复制，运气不好会在容器升级或重启后坏掉。

这次把它整理成一份更容易维护的例子。示例分成三种：静态站、PHP-FPM、以及把 Nginx 作为 Halo 之类服务的反向代理。三种可以单独用，不需要全部一起启动。

## 目录结构

```text
website/
├── compose.yml
├── nginx/
│   └── default.conf
├── php/
│   └── default.conf
└── site/
    ├── index.html
    └── index.php
```

先创建目录：

```bash
mkdir -p website/{nginx,php,site}
cd website
```

## 部署静态网站

如果只是 Astro、Hugo 或普通 HTML，先用最简单的 Nginx：

```yaml
# compose.yml
services:
  nginx:
    image: nginx:1.27-alpine
    container_name: website-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./site:/usr/share/nginx/html:ro
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    read_only: true
    tmpfs:
      - /var/cache/nginx
      - /var/run
```

对应的 `nginx/default.conf`：

```nginx
server {
    listen 80;
    server_name example.com;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location = /healthz {
        add_header Content-Type text/plain;
        return 200 "ok\n";
    }
}
```

启动并检查：

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose exec nginx nginx -t
docker compose logs --tail=100 nginx
```

不要使用 `nginx:latest`。固定到一个明确的大版本，升级时手动改版本并先在测试机执行 `nginx -t`。

## 加 PHP-FPM

PHP-FPM 和 Nginx 不需要互相查 IP。把它们放在同一个 Compose 网络里，直接使用服务名 `php`：

```yaml
services:
  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./site:/var/www/html:ro
      - ./php/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - php

  php:
    image: php:8.3-fpm-alpine
    restart: unless-stopped
    volumes:
      - ./site:/var/www/html:ro
```

`php/default.conf`：

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/html;
    index index.php index.html;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        try_files $uri =404;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param SCRIPT_NAME $fastcgi_script_name;
        fastcgi_pass php:9000;
    }

    location ~ /\. {
        deny all;
    }
}
```

这里有两个容易写错的地方：`location ~ \.php$` 需要正则匹配，不能写成 `location \.php$`；`fastcgi_pass` 写 Compose 服务名 `php:9000`，不要手工查 `172.17.0.3` 之类的临时容器 IP。

启动后可以放一个最小的 `site/index.php`：

```php
<?php
header('Content-Type: text/plain; charset=utf-8');
echo "PHP is working\n";
```

检查：

```bash
docker compose up -d
docker compose exec nginx nginx -t
curl -i http://127.0.0.1/index.php
docker compose logs --tail=100 nginx php
```

## 给 Halo 做反向代理

如果 Halo 已经运行在宿主机的 `127.0.0.1:8090`，Nginx 容器里的 `127.0.0.1` 指向的是容器自己，不是宿主机。Linux 上可以把宿主机映射成 `host.docker.internal`：

```yaml
services:
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./nginx/halo.conf:/etc/nginx/conf.d/default.conf:ro
```

`nginx/halo.conf`：

```nginx
server {
    listen 80;
    server_name blog.example.com;
    client_max_body_size 64m;

    location / {
        proxy_pass http://host.docker.internal:8090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

如果 Halo 也在 Compose 里，就把它加入同一个 Compose 文件，直接写 `proxy_pass http://halo:8090;`，不要暴露 Halo 的管理端口到公网。

## HTTPS 和上线前检查

证书可以由宿主机上的 Caddy、Certbot 或云 CDN 管理，Nginx 只负责监听 443；不要把真实证书提交进 Git。上线前至少检查：

```bash
docker compose config
docker compose up -d
docker compose ps
docker compose exec nginx nginx -t
curl -I http://example.com/
docker compose logs --tail=200
```

还要确认：

- `site` 和配置文件挂载为只读；
- PHP、Halo 的管理端口没有额外 `ports` 映射；
- 云防火墙只开放 80/443 和必要的 SSH 来源；
- 上传目录有明确的大小限制和备份；
- 镜像版本固定，升级前先备份 `compose.yml` 和数据卷；
- 反代后的域名、HTTPS 和 WebSocket 分别测试，不要只看首页能不能开。

Docker 本身不是“输入一条命令就永远稳定”。真正省事的做法是：固定镜像版本，用 Compose 网络里的服务名通信，配置文件先 `nginx -t`，再让容器重载。
