import type { APIRoute } from "astro";
import { fmtDate, getPosts } from "@/lib/posts";

/** 极简全文索引：标题 / 简介 / 标签 / 分类 / 正文纯文本（截断），前端按子串打分。 */
export const GET: APIRoute = async () => {
	const posts = await getPosts();
	const docs = posts.map((p) => ({
		t: p.title,
		u: p.url,
		d: p.description,
		g: p.tags,
		c: p.category || "未分类",
		p: fmtDate(p.published),
		b: plain(p.entry.body || "").slice(0, 2000),
	}));
	return new Response(JSON.stringify(docs), {
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
};

function plain(md: string): string {
	return md
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/[#>*_`~|]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}
