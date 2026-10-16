// Keep the source image archive intact, but do not deploy orphaned /upload files.
// Markdown, frontmatter, Astro components and config are all scanned for /upload/<file> references.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoots = [path.join(root, "src")];
const distUpload = path.join(root, "dist", "upload");
const used = new Set();

function walk(dir) {
	if (!fs.existsSync(dir)) return;
	for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, item.name);
		if (item.isDirectory()) walk(file);
		else {
			const text = fs.readFileSync(file, "utf8");
			for (const match of text.matchAll(/\/upload\/([^\s"'`)>?)#]+)/g)) {
				try {
					const name = decodeURIComponent(match[1]);
					if (fs.existsSync(path.join(root, "public", "upload", name))) used.add(name);
				} catch {
					if (fs.existsSync(path.join(root, "public", "upload", match[1]))) used.add(match[1]);
				}
			}
		}
	}
}

for (const dir of sourceRoots) walk(dir);

if (fs.existsSync(distUpload)) {
	let removed = 0;
	for (const item of fs.readdirSync(distUpload, { withFileTypes: true })) {
		if (item.isDirectory()) continue;
		if (!used.has(item.name)) {
			fs.unlinkSync(path.join(distUpload, item.name));
			removed++;
		}
	}
	console.log(`[prune-upload] kept ${used.size} referenced names; removed ${removed} orphaned deployment assets`);
}
