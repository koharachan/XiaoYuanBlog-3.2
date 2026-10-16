import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import rehypeSlug from "rehype-slug";
import { site } from "./src/config";
import { rehypeImages } from "./src/lib/rehype-images.mjs";
import { rehypeTables } from "./src/lib/rehype-tables.mjs";

export default defineConfig({
	site: site.url,
	trailingSlash: "always",
	build: {
		format: "directory",
		// One small stylesheet is cheaper to cache across pages than inlining it into every HTML file.
		inlineStylesheets: "never",
		assets: "assets",
	},
	integrations: [
		sitemap({
			filter: (page) => !page.includes("/ie/") && !page.endsWith("/404/"),
		}),
	],
	markdown: {
		shikiConfig: {
			// Dual theme: light colours are emitted as literal `color:` (works in IE),
			// dark colours as `--shiki-dark` custom properties picked up by the neon theme.
			themes: { light: "github-light", dark: "github-dark-dimmed" },
			defaultColor: "light",
			wrap: false,
		},
		rehypePlugins: [rehypeSlug, rehypeImages, rehypeTables],
	},
	vite: {
		build: {
			cssMinify: "esbuild",
			assetsInlineLimit: 0,
			rollupOptions: {
				output: {
					assetFileNames: "assets/[name]-[hash][extname]",
					chunkFileNames: "assets/[name]-[hash].js",
					entryFileNames: "assets/[name]-[hash].js",
				},
			},
		},
	},
});
