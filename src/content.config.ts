import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const posts = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
	schema: z.object({
		title: z.string(),
		published: z.coerce.date(),
		updated: z.coerce.date().optional().nullable(),
		draft: z.boolean().optional().default(false),
		description: z.string().optional().nullable().default(""),
		image: z.string().optional().nullable().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		pinned: z.boolean().optional().default(false),
		comment: z.boolean().optional().default(true),
		// 转载/来源信息（可选）
		author: z.string().optional().nullable().default(""),
		sourceLink: z.string().optional().nullable().default(""),
		licenseName: z.string().optional().nullable().default(""),
		licenseUrl: z.string().optional().nullable().default(""),
		// 旧字段，保留以兼容历史 frontmatter
		lang: z.string().optional().nullable(),
	}),
});

const spec = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/spec" }),
	schema: z.object({
		title: z.string().optional(),
		description: z.string().optional(),
	}),
});

export const collections = { posts, spec };
