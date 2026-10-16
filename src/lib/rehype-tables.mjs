/**
 * Wraps every <table> in a horizontally scrollable container so wide tables never
 * break the page width on phones (and never force the whole body to scroll sideways).
 */
export function rehypeTables() {
	return (tree) => {
		const visit = (node) => {
			if (!node.children) return;
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				if (child.type === "element" && child.tagName === "table") {
					node.children[i] = {
						type: "element",
						tagName: "div",
						properties: { className: ["table-wrap"] },
						children: [child],
					};
				} else {
					visit(child);
				}
			}
		};
		visit(tree);
	};
}
