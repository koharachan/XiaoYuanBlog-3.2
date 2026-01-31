/**
 * Halo 文章转 Firefly 主题格式
 *
 * 数据来源（按优先级）：
 * 1. extracted_posts.json - 已从 Halo extensions.data 或 halo-next.mv.db 导出的文章 JSON
 * 2. 可通过环境变量 HALO_POSTS_JSON 指定其它 JSON 路径
 *
 * Halo 内容格式说明：
 * - 纯 HTML：content 为字符串且不以 '[' 开头
 * - Block 编辑器的 diff 格式：content 为 JSON 数组 [{ source, target, type: "CHANGE" }]，
 *   取 target.lines 拼接为最终 HTML
 *
 * Firefly 文章 schema（见 src/content.config.ts）：
 * title, published, updated, draft, description, image, tags, category, comment 等
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_JSON = path.join(ROOT, "extracted_posts.json");
const OUTPUT_DIR = path.join(ROOT, "src", "content", "posts");
const HALO_UPLOAD_PREFIX = "/upload/";

/** 从 Halo 的 content 字段解析出纯 HTML 字符串 */
function extractHtmlFromContent(content) {
	if (!content) return "";
	const raw = typeof content === "string" ? content : JSON.stringify(content);
	const trimmed = raw.trim();
	// Halo Block 编辑器：content 为 JSON 数组，如 [{"source":{...},"target":{...},"type":"CHANGE"}]
	if (trimmed.startsWith("[")) {
		try {
			const arr = JSON.parse(raw);
			if (!Array.isArray(arr) || arr.length === 0) return "";
			// 取最后一条变更的 target.lines（最终展示内容）
			const last = arr[arr.length - 1];
			const target = last?.target;
			if (!target || !Array.isArray(target.lines)) return "";
			return target.lines.join("");
		} catch {
			return raw;
		}
	}
	return raw;
}

/** 将 HTML 转为 Markdown（使用 JSDOM 解析，保证结构正确） */
function htmlToMarkdown(html) {
	if (!html) return "";
	const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
	const doc = dom.window.document;
	const body = doc.body;
	if (!body) return "";

	// 移除脚本、样式、编辑相关标记
	body.querySelectorAll("script, style, [data-type], .html-edited, .markdown-edited").forEach((el) => el.remove());

	// 代码块：<pre><code class="language-xxx">...</code></pre>
	body.querySelectorAll("pre").forEach((pre) => {
		const code = pre.querySelector("code");
		const text = code ? code.textContent || "" : pre.textContent || "";
		const lang = code?.className?.replace(/^language-/, "")?.trim() || "";
		const md = `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
		pre.replaceWith(doc.createTextNode(md));
	});

	// 标题 h1-h6
	for (let i = 6; i >= 1; i--) {
		body.querySelectorAll(`h${i}`).forEach((h) => {
			const text = stripInlineHtml(h.innerHTML);
			const md = `${"#".repeat(i)} ${text}\n`;
			h.replaceWith(doc.createTextNode(md));
		});
	}

	// 图片：支持 src 与 data-src，alt 可选
	body.querySelectorAll("img").forEach((img) => {
		const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
		const alt = img.getAttribute("alt") || "";
		if (src) {
			const md = `![${alt}](${src})`;
			img.replaceWith(doc.createTextNode(md));
		}
	});

	// 链接
	body.querySelectorAll("a").forEach((a) => {
		const href = a.getAttribute("href") || "";
		const text = stripInlineHtml(a.innerHTML);
		if (href) {
			a.replaceWith(doc.createTextNode(`[${text}](${href})`));
		}
	});

	// 粗体、斜体、删除线、行内代码
	body.querySelectorAll("strong, b").forEach((el) => {
		el.replaceWith(doc.createTextNode(`**${stripInlineHtml(el.innerHTML)}**`));
	});
	body.querySelectorAll("em, i").forEach((el) => {
		el.replaceWith(doc.createTextNode(`*${stripInlineHtml(el.innerHTML)}*`));
	});
	body.querySelectorAll("s, del").forEach((el) => {
		el.replaceWith(doc.createTextNode(`~~${stripInlineHtml(el.innerHTML)}~~`));
	});
	body.querySelectorAll("code").forEach((el) => {
		const text = el.textContent || "";
		if (el.closest("pre")) return; // 已在上文处理
		el.replaceWith(doc.createTextNode(`\`${text}\``));
	});

	// 列表
	body.querySelectorAll("ul").forEach((ul) => {
		const items = Array.from(ul.querySelectorAll(":scope > li")).map((li) => `  - ${stripInlineHtml(li.innerHTML).trim()}`);
		ul.replaceWith(doc.createTextNode("\n" + items.join("\n") + "\n"));
	});
	body.querySelectorAll("ol").forEach((ol) => {
		const items = Array.from(ol.querySelectorAll(":scope > li")).map((li, idx) => `  ${idx + 1}. ${stripInlineHtml(li.innerHTML).trim()}`);
		ol.replaceWith(doc.createTextNode("\n" + items.join("\n") + "\n"));
	});

	// 引用
	body.querySelectorAll("blockquote").forEach((bq) => {
		const inner = stripInlineHtml(bq.innerHTML).trim().split("\n").map((line) => `> ${line}`).join("\n");
		bq.replaceWith(doc.createTextNode("\n" + inner + "\n"));
	});

	// 分割线
	body.querySelectorAll("hr").forEach((hr) => {
		hr.replaceWith(doc.createTextNode("\n---\n"));
	});

	// 段落：剩余 p、div 等转为纯文本 + 换行
	body.querySelectorAll("p, div").forEach((el) => {
		const text = stripInlineHtml(el.innerHTML).trim();
		if (text) {
			el.replaceWith(doc.createTextNode("\n" + text + "\n"));
		} else {
			el.replaceWith(doc.createTextNode("\n"));
		}
	});

	let text = body.textContent || "";
	text = text.replace(/\n{3,}/g, "\n\n").trim();
	return text;
}

function stripInlineHtml(html) {
	if (!html) return "";
	const frag = new JSDOM(`<div>${html}</div>`).window.document.body;
	if (!frag) return html;
	// 递归把内联标签转为文本（保留 code 等）
	frag.querySelectorAll("a").forEach((a) => {
		a.replaceWith(a.ownerDocument.createTextNode(a.textContent || ""));
	});
	frag.querySelectorAll("strong, b, em, i, s, del, code, span").forEach((el) => {
		el.replaceWith(el.ownerDocument.createTextNode(el.textContent || ""));
	});
	return (frag.textContent || "").trim();
}

/** 生成合法文件名 slug，避免重复 */
function toSlug(title, id, existingSlugs) {
	let base = (title || "")
		.replace(/\s+/g, "-")
		.replace(/[^\p{L}\p{N}-]/gu, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
	if (!base) base = (id || "").replace(/[^a-z0-9-]/gi, "-").slice(0, 32) || "post";
	let slug = base;
	let n = 0;
	while (existingSlugs.has(slug)) {
		slug = `${base}-${++n}`;
	}
	existingSlugs.add(slug);
	return slug;
}

/** 转义 YAML 字符串（含冒号、引号、换行时用双引号） */
function yamlValue(val) {
	if (val == null) return '""';
	if (typeof val === "boolean") return val ? "true" : "false";
	if (typeof val === "number") return String(val);
	if (Array.isArray(val)) return JSON.stringify(val);
	const s = String(val);
	if (/[\n:"\\]/.test(s)) {
		return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
	}
	return s;
}

function main() {
	const jsonPath = process.env.HALO_POSTS_JSON || DEFAULT_JSON;
	if (!fs.existsSync(jsonPath)) {
		console.error("未找到文章 JSON 文件:", jsonPath);
		console.error("请先从 Halo 导出文章到 extracted_posts.json，或设置 HALO_POSTS_JSON 指向该文件。");
		process.exit(1);
	}

	const raw = fs.readFileSync(jsonPath, "utf8");
	let posts;
	try {
		posts = JSON.parse(raw);
	} catch (e) {
		console.error("JSON 解析失败:", e.message);
		process.exit(1);
	}
	if (!Array.isArray(posts)) {
		console.error("JSON 根节点应为文章数组");
		process.exit(1);
	}

	if (!fs.existsSync(OUTPUT_DIR)) {
		fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	const existingSlugs = new Set();
	let written = 0;
	let skipped = 0;

	for (const post of posts) {
		const title = post.title?.trim();
		if (!title) {
			skipped++;
			continue;
		}

		const html = extractHtmlFromContent(post.content);
		const body = htmlToMarkdown(html);

		const slug = toSlug(post.slug || title, post.id, existingSlugs);
		const filePath = path.join(OUTPUT_DIR, `${slug}.md`);

		const published = post.published || post.create_time || post.createTime || new Date().toISOString();
		const updated = post.updated || post.update_time || post.updateTime || published;
		const description = (post.description || post.summary || "").trim().slice(0, 300);
		const image = post.cover || post.image || "";
		let tags = post.tags;
		if (!Array.isArray(tags)) {
			try {
				tags = typeof post.tags === "string" ? JSON.parse(post.tags) : [];
			} catch {
				tags = [];
			}
		}
		tags = tags.map((t) => (typeof t === "object" && t?.name ? t.name : String(t))).filter(Boolean);
		let category = post.category;
		if (category == null || category === "") {
			try {
				const cats = typeof post.categories === "string" ? JSON.parse(post.categories) : post.categories;
				category = Array.isArray(cats) && cats.length > 0
					? (typeof cats[0] === "object" && cats[0]?.name ? cats[0].name : String(cats[0]))
					: "";
			} catch {
				category = "";
			}
		}
		category = String(category || "").trim();

		const frontmatter = {
			title,
			published: new Date(published).toISOString().slice(0, 10),
			updated: new Date(updated).toISOString().slice(0, 10),
			draft: false,
			description: description || "",
			image: image || "",
			tags,
			category,
			comment: post.allowComment !== false,
		};

		const yamlLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${yamlValue(v)}`);
		const content = `---
${yamlLines.join("\n")}
---

${body}
`;

		fs.writeFileSync(filePath, content, "utf8");
		written++;
		console.log(`[OK] ${slug}.md  (${title})`);
	}

	console.log(`\n完成: 已写入 ${written} 篇，跳过 ${skipped} 篇。输出目录: ${OUTPUT_DIR}`);
}

main();
