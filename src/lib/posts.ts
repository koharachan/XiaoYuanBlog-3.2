import { type CollectionEntry, getCollection } from "astro:content";
import { publicImageSize } from "./image-size";

export type PostEntry = CollectionEntry<"posts">;

export interface Post {
	entry: PostEntry;
	slug: string;
	url: string;
	title: string;
	description: string;
	published: Date;
	updated: Date | null;
	tags: string[];
	category: string;
	pinned: boolean;
	image: string;
	imageSize: { width: number; height: number } | null;
	words: number;
	minutes: number;
	prev: { slug: string; title: string } | null;
	next: { slug: string; title: string } | null;
}

let cache: Promise<Post[]> | null = null;

export function getPosts(): Promise<Post[]> {
	if (!cache) cache = load();
	return cache;
}

async function load(): Promise<Post[]> {
	const entries = await getCollection("posts", ({ data }) => (import.meta.env.PROD ? !data.draft : true));
	const posts: Post[] = entries.map((entry) => {
		const slug = entry.id.replace(/\.(md|mdx)$/i, "");
		const { words, minutes } = countWords(entry.body || "");
		const image = (entry.data.image || "").trim();
		return {
			entry,
			slug,
			url: `/posts/${slug}/`,
			title: entry.data.title,
			description: (entry.data.description || "").trim(),
			published: entry.data.published,
			updated: entry.data.updated ?? null,
			tags: (entry.data.tags || []).map((t) => t.trim()).filter(Boolean),
			category: (entry.data.category || "").trim(),
			pinned: !!entry.data.pinned,
			image,
			imageSize: image.startsWith("/") ? publicImageSize(image) : null,
			words,
			minutes,
			prev: null,
			next: null,
		};
	});

	posts.sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return b.published.getTime() - a.published.getTime();
	});

	// prev = older post, next = newer post (in reading order of the list)
	for (let i = 0; i < posts.length; i++) {
		const newer = posts[i - 1];
		const older = posts[i + 1];
		posts[i].next = newer ? { slug: newer.slug, title: newer.title } : null;
		posts[i].prev = older ? { slug: older.slug, title: older.title } : null;
	}
	return posts;
}

/** CJK characters count as one word each; latin words count by whitespace. ~300 字/min. */
export function countWords(markdown: string): { words: number; minutes: number } {
	const text = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/[#>*_~|-]/g, " ");
	const cjk = (text.match(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g) || []).length;
	const latin = (text.replace(/[㐀-鿿豈-﫿぀-ヿ가-힯]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;
	const words = cjk + latin;
	return { words, minutes: Math.max(1, Math.round(words / 300)) };
}

export interface Term {
	name: string;
	count: number;
	url: string;
}

export async function getTags(): Promise<Term[]> {
	const posts = await getPosts();
	const map = new Map<string, number>();
	for (const p of posts) for (const t of p.tags) map.set(t, (map.get(t) || 0) + 1);
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
		.map(([name, count]) => ({ name, count, url: tagUrl(name) }));
}

export async function getCategories(): Promise<Term[]> {
	const posts = await getPosts();
	const map = new Map<string, number>();
	for (const p of posts) {
		const c = p.category || "未分类";
		map.set(c, (map.get(c) || 0) + 1);
	}
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
		.map(([name, count]) => ({ name, count, url: categoryUrl(name) }));
}

export const tagUrl = (tag: string) => `/archive/tag/${encodeURIComponent(tag)}/`;
export const categoryUrl = (c: string) => `/archive/category/${encodeURIComponent(c || "未分类")}/`;

/** Static route params for a per-term archive page. */
export async function termPaths(kind: "tag" | "category") {
	const terms = kind === "tag" ? await getTags() : await getCategories();
	const posts = await getPosts();
	return terms.map((t) => ({
		params: { [kind]: t.name },
		props: {
			term: t.name,
			posts: posts.filter((p) => (kind === "tag" ? p.tags.includes(t.name) : (p.category || "未分类") === t.name)),
		},
	}));
}

export function fmtDate(d: Date | null | undefined, withDay = true): string {
	if (!d) return "";
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return withDay ? `${y}-${m}-${day}` : `${y}-${m}`;
}

export function daysSince(d: Date): number {
	return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** First meaningful paragraph of a post body, used when a post has no description. */
export function excerpt(markdown: string, max = 120): string {
	const lines = markdown.split("\n");
	for (const raw of lines) {
		const line = raw.trim();
		if (!line || /^(#|!\[|>|```|---|\||<|:::)/.test(line) || /^[-*]\s/.test(line)) continue;
		const text = line
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/[*_`~]/g, "")
			.trim();
		if (text.length > 12) return text.length > max ? `${text.slice(0, max - 1)}…` : text;
	}
	return "";
}
