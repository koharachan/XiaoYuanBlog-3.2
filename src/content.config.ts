import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const postsCollection = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
	schema: z.object({
		title: z.string(),
		published: z.date(),
		updated: z.date().optional(),
		draft: z.boolean().optional().default(false),
		description: z.string().optional().nullable().default(""),
		image: z.string().optional().nullable().default(""),
		tags: z.array(z.string()).optional().default([]),
		category: z.string().optional().nullable().default(""),
		lang: z.string().optional().nullable().default(""),
		pinned: z.boolean().optional().default(false),
		author: z.string().optional().nullable().default(""),
		sourceLink: z.string().optional().nullable().default(""),
		licenseName: z.string().optional().nullable().default(""),
		licenseUrl: z.string().optional().nullable().default(""),
		comment: z.boolean().optional().default(true),

		/* For internal use */
		prevTitle: z.string().optional().nullable().default(""),
		prevSlug: z.string().optional().nullable().default(""),
		nextTitle: z.string().optional().nullable().default(""),
		nextSlug: z.string().optional().nullable().default(""),
	}),
});

const specCollection = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/spec" }),
	schema: z.object({}),
});

export const collections = {
	posts: postsCollection,
	spec: specCollection,
};
