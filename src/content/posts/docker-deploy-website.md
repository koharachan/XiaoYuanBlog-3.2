---
title: docker纯命令行部署网站
published: 2025-04-03
updated: 2025-04-04
draft: false
description: 
image: /upload/image-nhAz.jpg
tags: ["网站","服务器","教程"]
category: 外版
comment: true
---

### 1. 拉取 Nginx 容器

```bash
docker pull nginx:latest
```

### 2. 运行 Nginx 容器

在这里面:

`--name nginx` 就是容器的名称，可以自定义，但是不能包含特殊字符或空格，可以使用 `-` 或 `_` 来分隔。

`-p 80:80` 是把容器的80端口映射到服务器的80端口，格式是：

```
容器端口:服务器端口
```

`-p 443:443` 是把容器的443端口映射到服务器的443端口，443端口负责https，如果你不需要，可以删除这行。

```bash
docker run -d --name nginx -p 80:80 -p 443:443 \
  -v /var/www/html/dist:/usr/share/nginx/html:ro \
  -v /etc/nginx/sites-available/default:/etc/nginx/nginx.conf:ro \
  nginx:latest
```

**挂载说明：**

1. **挂载静态文件**：
   - 宿主机的 `/var/www/html/dist` 是静态文件的存放目录，挂载到容器的 `/usr/share/nginx/html`。
   - 设置为只读（`ro`）可以防止容器修改静态文件。

2. **挂载 Nginx 配置文件**：
   - 宿主机的 `/etc/nginx/sites-available/default` 是 Nginx 的配置文件，挂载到容器的 `/etc/nginx/nginx.conf`。
   - 设置为只读（`ro`）可以防止容器修改配置文件。

## 使用 PHP

和 `nginx` 一样，我们拉一下 `PHP` 的容器，我们可以直接用 docker run 来节省先 pull 后 run 的时间：

```bash
docker run -p 9000:9000 -d --name php-fpm -v /var/www:/usr/share/nginx/www php:7.1-fpm
```

**参数说明：**

- `-p 9000:9000`：将容器的9000端口映射到主机的9000端口
- `-d`：后台运行(守护进程)
- `--name myphp-fpm`：将容器命名为myphp-fpm
- `-v`：将主机中当前目录下的www挂载到容器的www目录

### 查看容器启动情况

```bash
docker ps -a
```

运行后会看到这样的内容：

```
CONTAINER ID        IMAGE               COMMAND                  CREATED             STATUS              PORTS                    NAMES
51adb2df6004        php:7.1-fpm         "docker-php-entrypoif"   45 seconds ago      Up 20 seconds       0.0.0.0:9000->9000/tcp   php-fpm
3218b3ad4e47        nginx               "nginx -g 'daemon off"   18 minutes ago      Up 5 minutes       0.0.0.0:80->80/tcp,0.0.0.0:443->80/tcp       nginx
```

说明两个容器都正常运行了，然后我们来看看ip，然后去修改nginx相关配置：

```bash
docker inspect myphp-fpm | grep "IPAddress"
```

然后会得到 `"SecondaryIPAddresses": null, "IPAddress": "172.17.0.3", "IPAddress": "172.17.0.3",` 这样的输出，其中 `172.17.0.3` 就是容器ip，我们记下来。

### 修改配置文件PHP部分

我们上面已经想到了容器里面没有vim，所以把路径映射了出来，我们接下来就不需要进入容器去编辑了。

我们直接进入vim去编辑（如果不会用vim看下文的vim怎么用，提示vim不存在看如何安装vim）：

```bash
vim /etc/nginx/sites-available/default/default.conf
```

把下面的内容放到 `server` 块中，这个时候也可以随便设置你的域名：

```nginx
location \.php$ {
    fastcgi_pass   你的容器ip:9000;
    fastcgi_index  index.php;
    fastcgi_param  SCRIPT_FILENAME  /usr/share/nginx/www$fastcgi_script_name;
    fastcgi_param  SCRIPT_NAME      $fastcgi_script_name;
    include        fastcgi_params;
}
```

**设置域名：**

可以在 `server` 块中设置 `server_name example.com 192.168.1.8; `

这个例子中设置了域名 `example.com` 和ip `192.168.1.8`。

### Vim 使用教程

**第一步：打开文件**

```bash
vim 文件路径
```

**第二步：进入编辑模式**

输入 “`i`” 切换编辑模式，然后就可以开始编辑了。

**第三步：保存并退出**

编辑完成后按下 `esc` 键退出编辑模式。

退出编辑模式后，确认当前输入法是英语（这个很重要），确认后按下英语的 `:` ，然后输入 `wq` ，你的文件就被保存并退出vim了。

**常见问题处理：**

- 如果提示你没有权限（你真的不是root用户），你需要通过 `:q!` 不保存并强制退出
- 如果你是root用户，你可以使用 `:w!` 强制保存，然后通过 `:q` 退出

### 更新 Nginx 配置文件

执行这个命令：

```bash
docker exec -it mynginx service nginx reload
```

然后得到 `[ ok ] Reloading nginx: nginx.` ，说明大功告成了。

这个时候我们来访问我们刚刚设置的ip/域名（你域名要已经解析到服务器上面）：

![](/upload/image-nhAz.jpg)

图片来自 [使用docker快速搭建nginx+php环境 - 代码汇 - 博客园](https://www.cnblogs.com/codehui/p/docker_nginx_php.html) 剪裁后得。

## 非PHP动态网站

这里以 halo 举例，我们跳过 halo 的部署，直接来到部署好的时候。

一样的，也要修改配置文件，但是简单很多。

用 vim 打开配置文件（关于vim的教程和常见问题看php部分的vim怎么用）：

```bash
vim /etc/nginx/sites-available/default/default.conf
```

在这个里面添加以下内容来配置反向代理：

```nginx
upstream halo {
  server 127.0.0.1:8090;
}

server {
  listen 80;
  listen [::]:80;
  server_name www.yourdomain.com;
  client_max_body_size 1024m;
  
  location / {
    proxy_pass http://halo;
    proxy_set_header HOST $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

**完整配置示例：**

```nginx
upstream halo {
    server 127.0.0.1:8090; 
}

server {
    listen 80 ;
    listen 443 ssl http2 ;
    listen [::]:443 ssl http2 ;
    
    server_name xyj.haokajia.vip 192.168.1.42 xyj.kohara123.asia;
    client_max_body_size 1024m;
    
    access_log /www/sites/xyj.haokajia.vip/log/access.log main;
    error_log /www/sites/xyj.haokajia.vip/log/error.log;
    
    location ^~ /.well-known/acme-challenge {
        allow all;
        root /usr/share/nginx/html;
    }
    
    location ^~ / {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        add_header X-Cache $upstream_cache_status;
        proxy_set_header Host xyj.haokajia.vip;
        proxy_ssl_server_name off;
        
        if ( $uri ~* "\.(gif|png|jpg|css|js|woff|woff2)$" ) {
            expires 1m;
        }
        
        proxy_ignore_headers Set-Cookie Cache-Control expires;
        proxy_cache proxy_cache_panel;
        proxy_cache_key $host$uri$is_args$args;
        proxy_cache_valid 200 304 301 302 10m;
    }
}
```
