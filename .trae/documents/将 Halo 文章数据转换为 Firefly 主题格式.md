# 将 Halo 文章数据转换为 Firefly 主题格式

## 问题分析
- Firefly 主题使用 Astro 的内容集合系统，文章存储在 `src/content/posts` 目录中，格式为 Markdown/MDX
- Halo 使用 **H2 数据库**（`halo-next.mv.db`）或扩展存储（`extensions.data`）保存文章，不是 SQLite
- 需要先将 Halo 文章导出为 JSON，再通过脚本转换为 Firefly 支持的 Markdown 格式

## Halo 文章存储规则（基于 halo-main 源码）

- **Post 扩展**（`run.halo.app.core.extension.content.Post`）：文章以 Extension 形式存储，含 `spec`（title、slug、cover、excerpt、categories、tags 等）和 `status`（phase、permalink、excerpt 等）
- **内容格式**：
  - 纯 HTML：`content` 为 HTML 字符串
  - Block 编辑器 diff 格式：`content` 为 JSON 数组 `[{ "source": { "lines": [...] }, "target": { "lines": [...] }, "type": "CHANGE" }]`，取 **target.lines** 拼接为最终 HTML
- **数据库**：Halo 2.x 使用 R2DBC + H2（`platform: h2`），文件为 `halo-next.mv.db`，不能直接用 SQLite 工具读取

## 已实现的方案

### 1. 数据来源
- **推荐（从 Halo 备份直接提取）**：使用脚本 `scripts/halo-backup-to-posts.js` 从 Halo 导出的 zip 或已解压目录（含 `extensions.data` + `workdir`）生成 `extracted_posts.json`。  
  - Halo 备份结构（见 halo-main `MigrationServiceImpl`）：zip 内根目录为 `extensions.data`（JSON 数组，每项为 ExtensionStore：`name`、`data`（Base64 编码的 Extension）、`version`）和 `workdir/`（工作目录副本）。  
  - 脚本会解析 `extensions.data`，筛选已发布的 Post（`/registry/content.halo.run/posts/`）和 Snapshot（`/registry/content.halo.run/snapshots/`），用 Post 的 `spec.releaseSnapshot` 关联 Snapshot 的 `spec.contentPatch` 作为正文，并输出带完整 title、slug、categories、tags、cover、published、updated 的 `extracted_posts.json`。  
  - 用法：`pnpm run halo-backup-to-posts [输入路径]`。输入路径可为：指向 `.zip` 的路径（需已安装 `adm-zip`：`pnpm add -D adm-zip`）、或已解压目录（如 `halo/`）。不传则默认 `halo/`。  
- **已有 JSON 时**：若已有 `extracted_posts.json`，可直接运行 `halo-to-firefly`；或通过环境变量指定：`HALO_POSTS_JSON=path/to/posts.json`

### 2. 转换脚本
- **脚本路径**：`scripts/halo-to-firefly.js`
- **功能**：
  - 从 `extracted_posts.json`（或 `HALO_POSTS_JSON`）读取文章列表
  - 解析 Halo 的 content：支持纯 HTML 和 Block 编辑器的 diff 格式（取 target.lines 拼接为 HTML）
  - 将 HTML 转为 Markdown（标题、段落、列表、代码块、图片、链接、粗体/斜体等）
  - 按 Firefly 的 content schema 生成 frontmatter：`title`、`published`、`updated`、`draft`、`description`、`image`、`tags`、`category`、`comment`
  - 输出到 `src/content/posts/{slug}.md`，slug 由标题或 id 生成，重复时自动加后缀（-1、-2…）

### 3. 使用方法
```bash
# 确保已存在 extracted_posts.json，然后执行
pnpm run halo-to-firefly
# 或
node scripts/halo-to-firefly.js

# 使用自定义 JSON 路径（Windows PowerShell）
$env:HALO_POSTS_JSON = "D:\path\to\posts.json"; pnpm run halo-to-firefly
```

### 4. 图片与链接
- 转换后正文中的图片路径保持为 Halo 原始形式（如 `/upload/xxx.png`）。若站点不再使用 Halo 域名，可：
  - 将 Halo 的 `upload` 目录拷贝到 Firefly 的 `public/` 下，或
  - 在主题/配置中统一配置资源基础 URL

### 5. 去重说明
- 若 `extracted_posts.json` 中存在多篇同标题或同 id 的不同版本（如历史快照），脚本会为重复的 slug 自动加数字后缀，因此可能生成多篇文件名不同的文章。若只需“每篇文章一篇”，请在导出 JSON 时只保留最新版本再运行脚本。

## 测试和验证
- 运行 `pnpm run dev` 启动开发服务器
- 检查 `src/content/posts` 下生成的 .md 是否在站点中正确显示
- 验证图片、链接、标签、分类是否正常

## 预期结果
- Halo 文章以 Firefly 主题要求的 Markdown + frontmatter 形式出现在 `src/content/posts`
- 格式、代码块、列表、图片、链接等在转换中尽量保留
- 若存在重复或历史版本，可事先精简 JSON 或事后手动删除不需要的 .md 文件