import { publicImageSize } from "./image-size.ts";

/**
 * Post-processes every <img> in article HTML:
 *  - lazy loading + async decoding (ignored by IE, harmless)
 *  - width/height for local /upload images so the layout does not jump while loading
 *  - wraps it in <figure> with the alt text as caption when there is one
 */
export function rehypeImages() {
	return (tree) => {
		walk(tree, (node, parent, index) => {
			if (node.type !== "element" || node.tagName !== "img") return;
			const p = (node.properties ||= {});
			p.loading = "lazy";
			p.decoding = "async";
			if (typeof p.src === "string" && p.src.startsWith("/")) {
				const size = publicImageSize(p.src);
				if (size) {
					p.width = size.width;
					p.height = size.height;
				}
			}
			// Markdown puts a lone image inside a <p>; turn that into a figure.
			if (parent && parent.type === "element" && parent.tagName === "p" && parent.children.length === 1) {
				parent.tagName = "figure";
				parent.properties = { className: ["post-figure"] };
				if (p.alt && String(p.alt).trim()) {
					parent.children.push({
						type: "element",
						tagName: "figcaption",
						properties: {},
						children: [{ type: "text", value: String(p.alt) }],
					});
				}
			}
			return index;
		});
	};
}

function walk(node, fn, parent = null, index = null) {
	fn(node, parent, index);
	if (node.children) {
		for (let i = 0; i < node.children.length; i++) walk(node.children[i], fn, node, i);
	}
}
