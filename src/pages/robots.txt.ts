import type { APIRoute } from "astro";
import { site } from "@/config";

export const GET: APIRoute = () =>
	new Response(`User-agent: *\nAllow: /\nDisallow: /ie/\n\nSitemap: ${site.url}/sitemap-index.xml\n`, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
