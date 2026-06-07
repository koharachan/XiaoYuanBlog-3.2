#!/usr/bin/env node

/**
 * Issues → Astro Blog Posts 转换脚本
 *
 * 由 GitHub Actions 触发，将 GitHub Issues 转换为
 * src/content/posts/ 下的 Markdown 文章（含 frontmatter）。
 *
 * 环境变量（由 workflow 传入）:
 *   ISSUE_TITLE   - Issue 标题
 *   ISSUE_BODY    - Issue 正文
 *   ISSUE_DATE    - Issue 更新时间 (ISO 8601)
 *   ISSUE_CREATED - Issue 创建时间 (ISO 8601)
 *   ISSUE_AUTHOR  - Issue 作者登录名
 *   ISSUE_LABELS  - JSON 数组字符串，如 ["标签1","标签2"]
 *   ISSUE_NUMBER  - Issue 编号
 *   ISSUE_ACTION  - 事件类型: opened | edited | deleted | closed | reopened
 */

import fs from "node:fs";
import path from "node:path";

const POSTS_DIR = "src/content/posts";

// ─── 工具函数 ───────────────────────────────────────────────

/** 由标题生成文件系统友好的 slug */
function slugify(title) {
	if (!title) return `issue-${Date.now()}`;
	let slug = title
		.toLowerCase()
		.replace(/[^\w\s\u4e00-\u9fff-]/g, "") // 保留字母、数字、中文、空格、连字符
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || `issue-${Date.now()}`;
}

/** 从正文提取描述（第一个非标题、非图片的文本行） */
function extractDescription(body) {
	if (!body) return "";
	const lines = body.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("!") && !trimmed.startsWith(">")) {
			return trimmed.substring(0, 200);
		}
	}
	return "";
}

/** 从正文提取第一张图片 URL */
function extractFirstImage(body) {
	if (!body) return "";
	const match = body.match(/!\[.*?\]\((.*?)\)/);
	return match ? match[1] : "";
}

/** 构建 YAML frontmatter */
function buildFrontmatter(meta) {
	const lines = ["---"];
	lines.push(`title: ${JSON.stringify(meta.title)}`);
	lines.push(`published: ${meta.published}`);
	lines.push(`updated: ${meta.updated}`);
	lines.push(`draft: ${meta.draft}`);
	if (meta.description) lines.push(`description: ${JSON.stringify(meta.description)}`);
	if (meta.image) lines.push(`image: ${JSON.stringify(meta.image)}`);
	if (meta.tags && meta.tags.length > 0) lines.push(`tags: ${JSON.stringify(meta.tags)}`);
	if (meta.category) lines.push(`category: ${JSON.stringify(meta.category)}`);
	if (meta.author) lines.push(`author: ${JSON.stringify(meta.author)}`);
	lines.push("sourceLink: " + JSON.stringify(meta.sourceLink || ""));
	lines.push("---");
	return lines.join("\n");
}

/** 格式化日期为 YYYY-MM-DD */
function fmtDate(isoStr) {
	if (!isoStr) return new Date().toISOString().slice(0, 10);
	return new Date(isoStr).toISOString().slice(0, 10);
}

// ─── 主逻辑 ─────────────────────────────────────────────────

function main() {
	const title = process.env.ISSUE_TITLE || "未命名文章";
	const body = process.env.ISSUE_BODY || "";
	const date = process.env.ISSUE_DATE;
	const created = process.env.ISSUE_CREATED || date;
	const author = process.env.ISSUE_AUTHOR || "";
	const rawLabels = process.env.ISSUE_LABELS || "[]";
	const issueNumber = process.env.ISSUE_NUMBER || "0";
	const action = process.env.ISSUE_ACTION || "opened";

	let labels;
	try {
		labels = JSON.parse(rawLabels);
	} catch {
		labels = [];
	}

	// labels 脱敏：移除可能包含空格或特殊字符的 label
	labels = labels.filter(Boolean).map((l) => l.trim());

	const slug = slugify(title);
	const filePath = path.join(POSTS_DIR, `${slug}.md`);

	console.log(`[issues-to-posts] Action: ${action}, Issue #${issueNumber}: "${title}"`);
	console.log(`[issues-to-posts] File path: ${filePath}`);
	console.log(`[issues-to-posts] Labels: ${JSON.stringify(labels)}`);

	// ── 处理删除 ──
	if (action === "deleted") {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
			console.log(`[issues-to-posts] Deleted: ${filePath}`);
		} else {
			// 也可能是通过旧 slug 创建的，尝试模糊匹配
			const files = fs.readdirSync(POSTS_DIR);
			const match = files.find((f) => f.includes(issueNumber) || f.startsWith(slug));
			if (match) {
				fs.unlinkSync(path.join(POSTS_DIR, match));
				console.log(`[issues-to-posts] Deleted: ${match}`);
			} else {
				console.log(`[issues-to-posts] File not found, skipping delete.`);
			}
		}
		return;
	}

	// ── 处理关闭 → draft ──
	const isDraft = action === "closed";

	// ── 构建元数据 ──
	const description = extractDescription(body);
	const image = extractFirstImage(body);

	// 分类策略：第一个 label 作为 category，其余作为 tags
	let category = "";
	const tags = [...labels];
	if (labels.length > 0) {
		category = labels[0];
	}

	const published = fmtDate(created);
	const updated = fmtDate(date);

	const frontmatter = buildFrontmatter({
		title,
		published,
		updated,
		draft: isDraft,
		description,
		image,
		tags: tags.length > 0 ? tags : undefined,
		category,
		author,
		sourceLink: `https://github.com/koharachan/XiaoYuanBlog-3.2/issues/${issueNumber}`,
	});

	// ── 写入文件 ──
	const content = `${frontmatter}\n\n${body}\n`;

	fs.mkdirSync(POSTS_DIR, { recursive: true });
	fs.writeFileSync(filePath, content, "utf-8");

	console.log(`[issues-to-posts] Written: ${filePath} (draft=${isDraft})`);
}

main();
