---
title: 网站优化 -01 缓存
published: 2025-02-21
updated: 2025-04-01
draft: false
description: 
image: /upload/image-wiht.jpg
tags: ["优化","网站","教程"]
category: 外版
comment: true
---

/upload/actuato/plugins/themes/acecss/js/images/webjars/styles
其中，只对 "/" 路径配置缓存，可以设置5-60分钟，其他的都是结果测试不能设置缓存的路径。
### 配置之后部分页面打不开怎么办
#### 我不知道目录

点击 f12 键或以其他方式启动开发人员工具，点击 ”控制台“ 或 "Console"，找到报错的地址。

![](/upload/image-wiht.jpg)

如图所示，图中说明了 /upload 目录无法被访问，并返回了404，那么我们就可以把这个地址按照我知道目录中的方法增加进反向代理中，并重试该操作。
#### 我知道目录

如果你已经明确目录，将不缓存的目录添加到反向代理中即可。

如果你 觉得/确定 它的父目录也 不应该/不能 被缓存，请直接增加父目录而不是子目录。
