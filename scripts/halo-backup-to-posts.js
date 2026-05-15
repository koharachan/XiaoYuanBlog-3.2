/**
 * 从 Halo 备份（zip 或已解压的 extensions.data + workdir）提取文章并生成 extracted_posts.json
 *
 * Halo 备份结构（见 halo-main MigrationServiceImpl）：
 * - zip 内根目录：extensions.data（JSON 数组）、workdir/（工作目录副本）
 * - extensions.data：每项为 ExtensionStore { name, data, version }
 *   - name 格式：/registry/{group}/{plural}/{extension-name}
 *   - data：Base64 编码的 Extension JSON（metadata, spec, status）
 * - 文章：name 以 /registry/content.halo.run/posts/ 开头，解码后为 Post
 * - 正文：name 以 /registry/content.halo.run/snapshots/ 开头，解码后为 Snapshot（spec.contentPatch / rawPatch）
 * - Post.spec.releaseSnapshot 指向已发布快照名，用其 contentPatch 作为正文
 *
 * 用法：
 *   node scripts/halo-backup-to-posts.js [输入路径]
 * 输入路径可为：
 *   - 指向 .zip 的路径 → 解压到临时目录后读取
 *   - 指向已解压目录（含 extensions.data 和 workdir）→ 直接读取
 *   - 不传则默认 halo/
 * 输出：extracted_posts.json（项目根目录），可直接再运行 pnpm run halo-to-firefly
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const POSTS_PREFIX = "/registry/content.halo.run/posts/";
const SNAPSHOTS_PREFIX = "/registry/content.halo.run/snapshots/";
const CATEGORIES_PREFIX = "/registry/content.halo.run/categories/";
const TAGS_PREFIX = "/registry/content.halo.run/tags/";
const PUBLISHED_LABEL = "content.halo.run/published";
const LAST_CATEGORIES_ANNO = "content.halo.run/last-associated-categories";
const LAST_TAGS_ANNO = "content.halo.run/last-associated-tags";

function decodeExtensionStoreData(data) {
	if (data == null) return null;
	try {
		const buf =
			typeof data === "string"
				? Buffer.from(data, "base64")
				: Array.isArray(data)
					? Buffer.from(data)
					: Buffer.isBuffer(data)
						? data
						: null;
		if (!buf) return null;
		return JSON.parse(buf.toString("utf8"));
	} catch {
		return null;
	}
}

function parseExtensionsData(filePath) {
	const raw = fs.readFileSync(filePath, "utf8");
	const arr = JSON.parse(raw);
	const posts = [];
	const snapshots = new Map();
	/** extension 名称 -> 显示名称（Category/Tag 的 spec.displayName） */
	const categoryNameToDisplay = new Map();
	const tagNameToDisplay = new Map();

	for (const item of arr) {
		const name = item?.name;
		if (!name || item.data == null) continue;

		const ext = decodeExtensionStoreData(item.data);
		if (!ext) continue;

		if (name.startsWith(POSTS_PREFIX)) {
			const postName = name.slice(POSTS_PREFIX.length);
			const published =
				ext.metadata?.labels?.[PUBLISHED_LABEL] === "true" || ext.metadata?.labels?.[PUBLISHED_LABEL] === true;
			const deleted = ext.spec?.deleted === true;
			if (published && !deleted) {
				posts.push({
					name: postName,
					metadata: ext.metadata,
					spec: ext.spec,
					status: ext.status,
				});
			}
		} else if (name.startsWith(SNAPSHOTS_PREFIX)) {
			const snapshotName = name.slice(SNAPSHOTS_PREFIX.length);
			snapshots.set(snapshotName, ext);
		} else if (name.startsWith(CATEGORIES_PREFIX)) {
			const categoryName = name.slice(CATEGORIES_PREFIX.length);
			const displayName = ext.spec?.displayName ?? ext.metadata?.name ?? categoryName;
			categoryNameToDisplay.set(categoryName, displayName);
		} else if (name.startsWith(TAGS_PREFIX)) {
			const tagName = name.slice(TAGS_PREFIX.length);
			const displayName = ext.spec?.displayName ?? ext.metadata?.name ?? tagName;
			tagNameToDisplay.set(tagName, displayName);
		}
	}

	return { posts, snapshots, categoryNameToDisplay, tagNameToDisplay };
}

function getCategories(post) {
	const spec = post.spec;
	const meta = post.metadata?.annotations || {};
	if (Array.isArray(spec?.categories) && spec.categories.length > 0) {
		return spec.categories.map((c) => (typeof c === "string" ? c : c?.name || c)).filter(Boolean);
	}
	try {
		const raw = meta[LAST_CATEGORIES_ANNO];
		if (typeof raw === "string") {
			const arr = JSON.parse(raw);
			return Array.isArray(arr) ? arr.map((c) => (typeof c === "string" ? c : c?.name || c)).filter(Boolean) : [];
		}
	} catch {}
	return [];
}

function getTags(post) {
	const spec = post.spec;
	const meta = post.metadata?.annotations || {};
	if (Array.isArray(spec?.tags) && spec.tags.length > 0) {
		return spec.tags.map((t) => (typeof t === "string" ? t : t?.name || t)).filter(Boolean);
	}
	try {
		const raw = meta[LAST_TAGS_ANNO];
		if (typeof raw === "string") {
			const arr = JSON.parse(raw);
			return Array.isArray(arr) ? arr.map((t) => (typeof t === "string" ? t : t?.name || t)).filter(Boolean) : [];
		}
	} catch {}
	return [];
}

function buildExtractedPosts(posts, snapshots, categoryNameToDisplay, tagNameToDisplay) {
	const out = [];
	const resolveCategory = (raw) => (raw ? (categoryNameToDisplay.get(raw) ?? raw) : "");
	const resolveTag = (raw) => (raw ? (tagNameToDisplay.get(raw) ?? raw) : "");

	for (const post of posts) {
		const releaseName = post.spec?.releaseSnapshot;
		let content = "";
		if (releaseName) {
			const snap = snapshots.get(releaseName);
			if (snap?.spec) {
				content = snap.spec.contentPatch || snap.spec.rawPatch || "";
			}
		}

		const meta = post.metadata || {};
		const created = meta.creationTimestamp || "";
		const updated = post.status?.lastModifyTime || meta.creationTimestamp || created;

		const rawCategories = getCategories(post);
		const rawTags = getTags(post);
		const categoryDisplay = rawCategories.length > 0 ? resolveCategory(rawCategories[0]) : "";
		const tagsDisplay = rawTags.map(resolveTag).filter(Boolean);
		const categoriesDisplay = rawCategories.map(resolveCategory).filter(Boolean);

		out.push({
			id: post.name,
			title: post.spec?.title ?? post.name,
			slug: post.spec?.slug ?? post.name,
			content,
			tags: tagsDisplay,
			category: categoryDisplay,
			categories: categoriesDisplay,
			published: post.spec?.publishTime || created,
			updated,
			cover: post.spec?.cover || "",
			description: post.spec?.excerpt?.raw ?? post.status?.excerpt ?? "",
			allowComment: post.spec?.allowComment !== false,
		});
	}

	// 按发布时间倒序
	out.sort((a, b) => {
		const t1 = new Date(a.published || 0).getTime();
		const t2 = new Date(b.published || 0).getTime();
		return t2 - t1;
	});

	return out;
}

async function ensureUnpacked(inputPath) {
	const resolved = path.resolve(ROOT, inputPath || "halo");
	const stat = fs.existsSync(resolved) && fs.statSync(resolved);
	if (!stat) {
		throw new Error(`输入路径不存在: ${resolved}`);
	}

	if (stat.isFile() && resolved.toLowerCase().endsWith(".zip")) {
		let AdmZip;
		try {
			AdmZip = (await import("adm-zip")).default;
		} catch {
			console.error("解压 zip 需要安装 adm-zip: pnpm add -D adm-zip");
			console.error("或请先将 Halo 备份 zip 解压到 halo/（含 extensions.data 和 workdir），再运行: node scripts/halo-backup-to-posts.js halo");
			process.exit(1);
		}
		const zip = new AdmZip(resolved);
		const tempDir = path.join(ROOT, ".halo-backup-temp");
		fs.mkdirSync(tempDir, { recursive: true });
		zip.extractAllTo(tempDir, true);
		return tempDir;
	}

	if (stat.isDirectory()) {
		const extPath = path.join(resolved, "extensions.data");
		if (!fs.existsSync(extPath)) {
			throw new Error(`目录下未找到 extensions.data: ${resolved}`);
		}
		return resolved;
	}

	throw new Error(`输入路径应为 .zip 或含 extensions.data 的目录: ${resolved}`);
}

async function main() {
	const inputPath = process.argv[2] || "halo";
	let baseDir;

	try {
		baseDir = await ensureUnpacked(inputPath);
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}

	const extensionsPath = path.join(baseDir, "extensions.data");
	if (!fs.existsSync(extensionsPath)) {
		console.error("未找到 extensions.data:", extensionsPath);
		process.exit(1);
	}

	console.log("正在解析 extensions.data ...");
	const { posts, snapshots, categoryNameToDisplay, tagNameToDisplay } = parseExtensionsData(extensionsPath);
	console.log(`  Post 数量: ${posts.length}, Snapshot 数量: ${snapshots.size}, Category 数量: ${categoryNameToDisplay.size}, Tag 数量: ${tagNameToDisplay.size}`);

	const extracted = buildExtractedPosts(posts, snapshots, categoryNameToDisplay, tagNameToDisplay);
	const outPath = path.join(ROOT, "extracted_posts.json");
	fs.writeFileSync(outPath, JSON.stringify(extracted, null, 2), "utf8");
	console.log(`已写入 ${extracted.length} 篇文章到 ${outPath}`);

	if (baseDir.includes(".halo-backup-temp")) {
		fs.rmSync(baseDir, { recursive: true, force: true });
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
