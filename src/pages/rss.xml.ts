import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { author, site } from "@/config";
import { excerpt, getPosts } from "@/lib/posts";

export async function GET(context: APIContext) {
	const posts = await getPosts();
	return rss({
		title: site.title,
		description: site.description,
		site: context.site ?? site.url,
		trailingSlash: true,
		customData: `<language>${site.lang}</language><managingEditor>${author.name}</managingEditor>`,
		items: posts.map((p) => ({
			title: p.title,
			pubDate: p.published,
			description: p.description || excerpt(p.entry.body || "", 200),
			link: p.url,
			categories: [p.category || "未分类", ...p.tags],
		})),
	});
}
