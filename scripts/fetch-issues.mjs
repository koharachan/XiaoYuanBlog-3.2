#!/usr/bin/env node

/**
 * 从 GitHub Issues 拉取内容并生成本地文章
 *
 * 用法:
 *   node scripts/fetch-issues.mjs              # 拉取所有 open 的 Issue
 *   node scripts/fetch-issues.mjs --all        # 拉取所有 Issue（包括 closed）
 *   node scripts/fetch-issues.mjs --issue 1    # 拉取指定 Issue 编号
 *   node scripts/fetch-issues.mjs --issue 1,3  # 拉取多个指定 Issue
 *
 * 环境变量:
 *   GH_TOKEN    - GitHub Token（可选，未提供则用于公开仓库的未认证请求，但有频率限制）
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const POSTS_DIR = "src/content/posts";
const REPO = "koharachan/XiaoYuanBlog-3.2";
const API_BASE = `https://api.github.com/repos/${REPO}/issues`;

// ─── 工具函数 ───────────────────────────────────────────────

function slugify(title) {
	if (!title) return `issue-${Date.now()}`;
	let slug = title
		.toLowerCase()
		.replace(/[^\w\s\u4e00-\u9fff-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || `issue-${Date.now()}`;
}

function extractDescription(body) {
	if (!body) return "";
	const lines = body.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("!") && !trimmed.startsWith(">") && !trimmed.startsWith("---")) {
			return trimmed.substring(0, 200);
		}
	}
	return "";
}

function extractFirstImage(body) {
	if (!body) return "";
	const match = body.match(/!\[.*?\]\((.*?)\)/);
	return match ? match[1] : "";
}

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
	lines.push(`sourceLink: ${JSON.stringify(meta.sourceLink || "")}`);
	lines.push("comment: true");
	lines.push("---");
	return lines.join("\n");
}

function fmtDate(isoStr) {
	if (!isoStr) return new Date().toISOString().slice(0, 10);
	return new Date(isoStr).toISOString().slice(0, 10);
}

function log(...args) {
	console.log(`[fetch-issues]`, ...args);
}

// ─── GitHub API ─────────────────────────────────────────────

async function fetchIssues(options = {}) {
	const { issueNumber, all = false } = options;
	let url;

	if (issueNumber) {
		url = `${API_BASE}/${issueNumber}`;
	} else {
		url = `${API_BASE}?state=${all ? "all" : "open"}&per_page=100&sort=created&direction=desc`;
	}

	const headers = { Accept: "application/vnd.github.v3+json" };
	const token = process.env.GH_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;

	log(`Fetching: ${url}`);
	const res = await fetch(url, { headers });

	if (!res.ok) {
		throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
	}

	const data = await res.json();
	return issueNumber ? [data] : data;
}

async function fetchIssueComments(issueNumber) {
	const url = `${API_BASE}/${issueNumber}/comments?per_page=100`;
	const headers = { Accept: "application/vnd.github.v3+json" };
	const token = process.env.GH_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;

	const res = await fetch(url, { headers });
	if (!res.ok) return [];
	return res.json();
}

function convertIssueToPost(issue) {
	const title = issue.title || "未命名文章";
	const body = issue.body || "";
	const labels = (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);

	const slug = slugify(title);
	const filePath = path.join(POSTS_DIR, `${slug}.md`);

	const isDraft = issue.state === "closed";
	const description = extractDescription(body);
	const image = extractFirstImage(body);

	let category = "";
	const tags = [...labels];
	if (labels.length > 0) {
		category = labels[0];
	}

	const published = fmtDate(issue.created_at);
	const updated = fmtDate(issue.updated_at);

	const frontmatter = buildFrontmatter({
		title,
		published,
		updated,
		draft: isDraft,
		description,
		image,
		tags: tags.length > 0 ? tags : undefined,
		category,
		author: issue.user?.login || "",
		sourceLink: issue.html_url,
	});

	return { filePath, content: `${frontmatter}\n\n${body}\n`, slug, issueNumber: issue.number };
}

// ─── 主逻辑 ─────────────────────────────────────────────────

async function main() {
	const args = process.argv.slice(2);
	const issueFlag = args.find((a) => a.startsWith("--issue=") || a.startsWith("--issue "));
	const allFlag = args.includes("--all");

	let issueNumbers = [];
	if (issueFlag) {
		const val = issueFlag.replace(/^--issue[= ]/, "");
		issueNumbers = val.split(",").map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
	}

	try {
		let issues = [];

		if (issueNumbers.length > 0) {
			for (const num of issueNumbers) {
				log(`Fetching issue #${num}...`);
				const issue = await fetchIssues({ issueNumber: num });
				if (issue && issue.id) issues.push(issue);
				else log(`  Issue #${num} not found, skipping`);
			}
		} else {
			issues = await fetchIssues({ all: allFlag });
			log(`Fetched ${issues.length} issues`);
		}

		if (issues.length === 0) {
			log("No issues found.");
			return;
		}

		// 过滤掉 Pull Request（GitHub API 会把 PR 也当成 Issue 返回）
		issues = issues.filter((i) => !i.pull_request);

		log(`Converting ${issues.length} issues to posts...`);
		fs.mkdirSync(POSTS_DIR, { recursive: true });

		let created = 0,
			updated = 0;

		for (const issue of issues) {
			const { filePath, content } = convertIssueToPost(issue);

			const exists = fs.existsSync(filePath);
			fs.writeFileSync(filePath, content, "utf-8");

			if (exists) {
				log(`  Updated: ${path.basename(filePath)} (Issue #${issue.number})`);
				updated++;
			} else {
				log(`  Created: ${path.basename(filePath)} (Issue #${issue.number})`);
				created++;
			}
		}

		log(`Done! Created ${created}, Updated ${updated}`);
	} catch (err) {
		console.error(`[fetch-issues] Error:`, err.message);
		process.exit(1);
	}
}

main();
