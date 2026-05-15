import { type CollectionEntry, getCollection } from "astro:content";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getCategoryUrl } from "@utils/url-utils";

declare global {
	interface ImportMeta {
		readonly env: {
			readonly PROD: boolean;
			readonly DEV: boolean;
		};
	}
}

type RawPost = CollectionEntry<"posts">;

let _postsCache: RawPost[] | null = null;

async function getAllPosts(): Promise<RawPost[]> {
	if (_postsCache) return _postsCache;

	_postsCache = await getCollection("posts", ({ data }) => {
		return import.meta.env.PROD ? data.draft !== true : true;
	});

	_postsCache.sort((a, b) => {
		if (a.data.pinned && !b.data.pinned) return -1;
		if (!a.data.pinned && b.data.pinned) return 1;
		const dateA = new Date(a.data.published).getTime();
		const dateB = new Date(b.data.published).getTime();
		return dateB - dateA;
	});

	return _postsCache;
}

export async function getSortedPosts(): Promise<RawPost[]> {
	const posts = await getAllPosts();
	for (let i = 1; i < posts.length; i++) {
		posts[i].data.nextSlug = posts[i - 1].id;
		posts[i].data.nextTitle = posts[i - 1].data.title;
	}
	for (let i = 0; i < posts.length - 1; i++) {
		posts[i].data.prevSlug = posts[i + 1].id;
		posts[i].data.prevTitle = posts[i + 1].data.title;
	}
	return posts;
}

export type PostForList = {
	id: string;
	data: RawPost["data"];
};

export async function getSortedPostsList(): Promise<PostForList[]> {
	const posts = await getAllPosts();
	return posts.map((post) => ({ id: post.id, data: post.data }));
}

export type Tag = {
	name: string;
	count: number;
};

export async function getTagList(): Promise<Tag[]> {
	const posts = await getAllPosts();
	const countMap: Record<string, number> = {};

	for (const post of posts) {
		for (const tag of post.data.tags) {
			countMap[tag] = (countMap[tag] || 0) + 1;
		}
	}

	return Object.keys(countMap)
		.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
		.map((key) => ({ name: key, count: countMap[key] }));
}

export type Category = {
	name: string;
	count: number;
	url: string;
};

export async function getCategoryList(): Promise<Category[]> {
	const posts = await getAllPosts();
	const count: Record<string, number> = {};
	const uncategorizedKey = i18n(I18nKey.uncategorized);

	for (const post of posts) {
		const category = post.data.category?.trim() || "";
		const key = category || uncategorizedKey;
		count[key] = (count[key] || 0) + 1;
	}

	return Object.keys(count)
		.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
		.map((key) => ({ name: key, count: count[key], url: getCategoryUrl(key) }));
}
