/**
 * 全站唯一的客户端脚本：主题切换、导航抽屉、搜索、代码复制、图片灯箱、
 * 目录高亮、回到顶部、懒加载评论与统计。所有功能都是渐进增强，没有 JS 页面也完整可读。
 * 液态玻璃透镜来自 liquidglass.dev（src/vendor/liquid-glass），在自定义元素升级时挂上。
 */
import "../vendor/liquid-glass/components.js";

type Theme = "neon" | "cloud";
const html = document.documentElement;
const $ = <T extends Element = HTMLElement>(
	sel: string,
	root: ParentNode = document,
) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(
	sel: string,
	root: ParentNode = document,
) => [...root.querySelectorAll<T>(sel)];

/* ---------- theme ---------- */
function currentTheme(): Theme {
	return html.dataset.theme === "cloud" ? "cloud" : "neon";
}
function setTheme(t: Theme) {
	html.dataset.theme = t;
	try {
		localStorage.setItem("theme", t);
	} catch {}
	$$("[data-set-theme]").forEach((b) =>
		b.setAttribute(
			"aria-checked",
			String(b.getAttribute("data-set-theme") === t),
		),
	);
	$("meta[name=theme-color]")?.setAttribute(
		"content",
		t === "cloud" ? "#f3ece3" : "#121820",
	);
	syncGiscusTheme();
}
$$("[data-set-theme]").forEach((b) =>
	b.addEventListener("click", () => {
		setTheme(b.getAttribute("data-set-theme") as Theme);
		closeMenus();
	}),
);
$$("[data-set-theme]").forEach((b) =>
	b.setAttribute(
		"aria-checked",
		String(b.getAttribute("data-set-theme") === currentTheme()),
	),
);

/* ---------- menus / drawer ---------- */
function closeMenus(except?: Element | null) {
	$$("[data-menu]").forEach((m) => {
		if (m !== except) {
			m.setAttribute("data-open", "false");
			$("button", m)?.setAttribute("aria-expanded", "false");
		}
	});
}
$$("[data-menu]").forEach((m) => {
	const btn = $("button", m);
	btn?.addEventListener("click", (e) => {
		e.stopPropagation();
		const open = m.getAttribute("data-open") === "true";
		closeMenus(m);
		m.setAttribute("data-open", String(!open));
		btn.setAttribute("aria-expanded", String(!open));
	});
});
const drawer = $("#drawer");
const burger = $("#burger");
function setDrawer(open: boolean) {
	if (!drawer) return;
	const next = open ? "true" : "false";
	if (drawer.getAttribute("data-open") === next) return;
	drawer.setAttribute("data-open", next);
	burger?.setAttribute("aria-expanded", next);
	drawer.classList.add("is-moving");
	setTimeout(() => drawer.classList.remove("is-moving"), 180);
}
burger?.addEventListener("click", (e) => {
	e.stopPropagation();
	setDrawer(drawer?.getAttribute("data-open") !== "true");
});
document.addEventListener("click", (e) => {
	if (!(e.target as Element).closest("[data-menu]")) closeMenus();
	if (!(e.target as Element).closest("#drawer, #burger")) setDrawer(false);
});
document.addEventListener("keydown", (e) => {
	if (e.key !== "Escape") return;
	if (dialog?.open) {
		e.preventDefault();
		closeSearch();
		return;
	}
	closeMenus();
	setDrawer(false);
});

/* ---------- liquid glass: pointer light on the lens, press on small controls ---------- */
const GLARE = "lg-panel.card--glow";
const SQUISH =
	".ibtn, .btn, .chip, .nav__links a, .menu__item, .drawer a, .termlist a, .pager a, lg-panel.card--glow";
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let lit: HTMLElement[] = [];
let down: HTMLElement[] = [];
let squish: HTMLElement | null = null;
let glareFrame = 0;
let pendingSpots: { el: HTMLElement; x: number; y: number }[] | null = null;
let pendingTouch = false;

function glareUnder(e: Event) {
	const found: HTMLElement[] = [];
	for (const node of e.composedPath()) {
		if (node instanceof HTMLElement && node.matches(GLARE)) found.push(node);
	}
	return found;
}
function place(el: HTMLElement, x: number, y: number) {
	el.style.setProperty("--x", `${x}px`);
	el.style.setProperty("--y", `${y}px`);
}
function spotsFor(els: HTMLElement[], e: PointerEvent) {
	return els.map((el) => {
		const rect = el.getBoundingClientRect();
		return { el, x: e.clientX - rect.left, y: e.clientY - rect.top };
	});
}
function clearLit(keep: HTMLElement[]) {
	for (const el of lit) {
		if (!keep.includes(el)) el.classList.remove("is-lit");
	}
	lit = keep;
}
function applyPending() {
	const spots = pendingSpots;
	pendingSpots = null;
	if (!spots) return;
	if (pendingTouch) {
		for (const s of spots) place(s.el, s.x, s.y);
		return;
	}
	clearLit(spots.map((s) => s.el));
	for (const s of spots) {
		s.el.classList.add("is-lit");
		place(s.el, s.x, s.y);
	}
}
function releaseGlare(e: PointerEvent) {
	squish?.classList.remove("is-pressed");
	squish = null;
	for (const el of down) el.classList.remove("is-down");
	if (e.pointerType !== "mouse") clearLit([]);
	down = [];
}
if (!reduceMotion) {
	document.addEventListener(
		"pointermove",
		(e) => {
			// Touch drags are scrolls. Measuring cards here forced layout mid-fling.
			if (e.pointerType === "touch") return;
			// composedPath() is empty once the event finishes, so capture targets now.
			const stack = glareUnder(e);
			pendingTouch = false;
			pendingSpots = spotsFor(stack, e);
			if (glareFrame) return;
			glareFrame = requestAnimationFrame(() => {
				glareFrame = 0;
				applyPending();
			});
		},
		{ passive: true },
	);
	document.addEventListener("pointerdown", (e) => {
		const stack = glareUnder(e);
		for (const s of spotsFor(stack, e)) {
			s.el.classList.add("is-lit", "is-down");
			place(s.el, s.x, s.y);
		}
		if (e.pointerType !== "mouse") lit = stack;
		down = stack;
		const target = e.target;
		const hit =
			target instanceof Element ? target.closest<HTMLElement>(SQUISH) : null;
		if (hit) {
			hit.classList.add("is-pressed");
			squish = hit;
		}
	});
	document.addEventListener("pointerup", releaseGlare);
	document.addEventListener("pointercancel", releaseGlare);
}

/* ---------- search ---------- */
interface Doc {
	t: string;
	u: string;
	d: string;
	g: string[];
	c: string;
	p: string;
	b: string;
}
const dialog = $<HTMLDialogElement>("#search");
const input = $<HTMLInputElement>("#search-input");
const results = $("#search-results");
let docs: Doc[] | null = null;
let docsPromise: Promise<void> | null = null;
let sel = -1;

function loadDocs() {
	if (docs) return Promise.resolve();
	if (!docsPromise) {
		docsPromise = fetch("/search.json")
			.then((r) => r.json())
			.then((j: Doc[]) => {
				docs = j;
			})
			.catch(() => {
				docsPromise = null;
				if (results)
					results.innerHTML =
						'<div class="empty">索引加载失败，请刷新重试。</div>';
			});
	}
	return docsPromise;
}
const prefetch = (cb: () => void) => {
	if ("requestIdleCallback" in window) {
		(
			window as Window & {
				requestIdleCallback: (
					cb: () => void,
					o?: { timeout: number },
				) => void;
			}
		).requestIdleCallback(cb, { timeout: 1200 });
	} else setTimeout(cb, 400);
};
prefetch(() => {
	loadDocs();
});

let lockedY = 0;
function lockPage() {
	lockedY = scrollY;
	document.documentElement.classList.add("search-open");
	document.body.style.position = "fixed";
	document.body.style.top = `-${lockedY}px`;
	document.body.style.left = "0";
	document.body.style.right = "0";
	document.body.style.width = "100%";
}
function unlockPage() {
	document.documentElement.classList.remove("search-open");
	document.body.style.position = "";
	document.body.style.top = "";
	document.body.style.left = "";
	document.body.style.right = "";
	document.body.style.width = "";
	scrollTo({ top: lockedY, behavior: "auto" });
}
function markSearchShown() {
	dialog?.classList.add("is-shown");
}
function openSearch() {
	if (!dialog || dialog.open) {
		input?.focus();
		return;
	}
	dialog.classList.remove("is-closing", "is-shown");
	lockPage();
	if (typeof dialog.showModal === "function") dialog.showModal();
	else dialog.setAttribute("open", "");
	input?.focus();
	if (reduceMotion) markSearchShown();
	else {
		const panel = $(".search__panel", dialog);
		const done = (event?: Event) => {
			if (event && event.target !== panel) return;
			if (dialog.classList.contains("is-closing")) return;
			markSearchShown();
		};
		panel?.addEventListener("animationend", done, { once: true });
		setTimeout(done, 200);
	}
	loadDocs().then(() => {
		if (input?.value) render(input.value);
	});
}
function finishClose() {
	if (!dialog) return;
	dialog.classList.remove("is-closing", "is-shown");
	if (dialog.open && typeof dialog.close === "function") dialog.close();
	else dialog.removeAttribute("open");
	unlockPage();
}
function closeSearch() {
	if (!dialog?.open) return;
	if (reduceMotion || dialog.classList.contains("is-closing")) {
		if (!dialog.classList.contains("is-closing")) finishClose();
		return;
	}
	dialog.classList.remove("is-shown");
	dialog.classList.add("is-closing");
	const panel = $(".search__panel", dialog);
	let done = false;
	const end = (event?: Event) => {
		if (event && event.target !== panel) return;
		if (done) return;
		done = true;
		finishClose();
	};
	panel?.addEventListener("animationend", end, { once: true });
	setTimeout(end, 200);
}
$$("[data-open-search]").forEach((b) =>
	b.addEventListener("click", openSearch),
);
$$("[data-search-close]").forEach((b) =>
	b.addEventListener("click", closeSearch),
);
dialog?.addEventListener("click", (e) => {
	if (e.target === dialog) closeSearch();
});
dialog?.addEventListener("close", () => {
	if (document.body.style.position === "fixed") unlockPage();
});
document.addEventListener("keydown", (e) => {
	const tag = (e.target as HTMLElement).tagName;
	const typing =
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		(e.target as HTMLElement).isContentEditable;
	if (
		(e.key === "k" && (e.ctrlKey || e.metaKey)) ||
		(e.key === "/" && !typing)
	) {
		e.preventDefault();
		openSearch();
	}
});
const esc = (s: string) =>
	s.replace(
		/[&<>"]/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
	);
function hl(text: string, terms: string[]) {
	let out = esc(text);
	for (const t of terms) {
		if (!t) continue;
		out = out.replace(
			new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
			(m) => `<mark>${m}</mark>`,
		);
	}
	return out;
}
function render(q: string) {
	if (!results) return;
	const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
	sel = -1;
	if (!terms.length || !docs) {
		results.innerHTML = docs ? "" : '<div class="empty">正在加载索引…</div>';
		return;
	}
	const scored = docs
		.map((d) => {
			let s = 0;
			const title = d.t.toLowerCase();
			const desc = d.d.toLowerCase();
			const body = d.b.toLowerCase();
			const tags = d.g.join(" ").toLowerCase();
			for (const t of terms) {
				if (title.includes(t)) s += 10;
				if (tags.includes(t)) s += 6;
				if (desc.includes(t)) s += 4;
				if (body.includes(t)) s += 1;
			}
			return { d, s };
		})
		.filter((x) => x.s > 0)
		.sort((a, b) => b.s - a.s)
		.slice(0, 20);
	if (!scored.length) {
		results.innerHTML = '<div class="empty">没有找到相关文章。</div>';
		return;
	}
	const frag = document.createDocumentFragment();
	scored.forEach(({ d }, i) => {
		const a = document.createElement("a");
		a.href = d.u;
		a.style.setProperty("--i", String(Math.min(i, 12)));
		a.innerHTML = `<b>${hl(d.t, terms)}</b><span>${hl(d.d || snippet(d.b, terms), terms)}</span><small>${d.p} · ${esc(d.c)}${d.g.length ? ` · ${esc(d.g.join(" / "))}` : ""}</small>`;
		frag.appendChild(a);
	});
	results.replaceChildren(frag);
}
function snippet(body: string, terms: string[]) {
	const i = Math.max(0, body.toLowerCase().indexOf(terms[0]) - 30);
	return `${i > 0 ? "…" : ""}${body.slice(i, i + 110)}…`;
}
input?.addEventListener("input", () => render(input.value));
input?.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		e.preventDefault();
		closeSearch();
		return;
	}
	const items = $$("a", results ?? document);
	if (!items.length) return;
	if (e.key === "ArrowDown" || e.key === "ArrowUp") {
		e.preventDefault();
		sel =
			(sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
		items.forEach((a, i) => a.setAttribute("aria-selected", String(i === sel)));
		items[sel].scrollIntoView({ block: "nearest" });
	} else if (e.key === "Enter" && sel >= 0) {
		location.href = (items[sel] as HTMLAnchorElement).href;
	}
});

/* ---------- code copy ---------- */
const copyIcon =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const okIcon =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L20 7"/></svg>';
$$("pre.astro-code").forEach((pre) => {
	const btn = document.createElement("button");
	btn.className = "copy-btn";
	btn.type = "button";
	btn.setAttribute("aria-label", "复制代码");
	btn.innerHTML = copyIcon;
	btn.addEventListener("click", async () => {
		const code = $("code", pre)?.textContent ?? "";
		try {
			await navigator.clipboard.writeText(code);
		} catch {
			const ta = document.createElement("textarea");
			ta.value = code;
			document.body.appendChild(ta);
			ta.select();
			const legacyCopy = (
				document as unknown as { execCommand?: (command: string) => boolean }
			).execCommand;
			legacyCopy?.call(document, "copy");
			ta.remove();
		}
		btn.innerHTML = okIcon;
		btn.classList.add("ok");
		setTimeout(() => {
			btn.innerHTML = copyIcon;
			btn.classList.remove("ok");
		}, 1600);
	});
	pre.appendChild(btn);
	const lang = pre.getAttribute("data-language");
	if (lang && lang !== "plaintext" && lang !== "text")
		pre.setAttribute("data-lang", lang);
});

/* ---------- lightbox ---------- */
document.addEventListener("click", (e) => {
	const img = (e.target as Element).closest<HTMLImageElement>(
		".prose img, .article__cover img",
	);
	if (!img || (e.target as Element).closest("a")) return;
	const box = document.createElement("div");
	box.className = "lightbox";
	box.setAttribute("role", "dialog");
	const big = new Image();
	big.src = img.currentSrc || img.src;
	big.alt = img.alt;
	box.appendChild(big);
	const close = () => {
		box.remove();
		document.removeEventListener("keydown", onKey);
	};
	const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && close();
	box.addEventListener("click", close);
	document.addEventListener("keydown", onKey);
	document.body.appendChild(box);
});

/* ---------- TOC highlight ---------- */
const tocLinks = $$<HTMLAnchorElement>(".toc a[href^='#']");
if (tocLinks.length && "IntersectionObserver" in window) {
	const map = new Map<Element, HTMLAnchorElement[]>();
	for (const a of tocLinks) {
		const id = decodeURIComponent(a.getAttribute("href")!.slice(1));
		const h = document.getElementById(id);
		if (h) map.set(h, [...(map.get(h) || []), a]);
	}
	let current: Element | null = null;
	const io = new IntersectionObserver(
		(entries) => {
			for (const en of entries) if (en.isIntersecting) current = en.target;
			if (!current) return;
			tocLinks.forEach((a) => a.classList.remove("active"));
			map.get(current)?.forEach((a) => {
				a.classList.add("active");
				const scroller = a.closest<HTMLElement>(".side--sticky");
				if (!scroller) return;
				const link = a.getBoundingClientRect();
				const box = scroller.getBoundingClientRect();
				if (link.top < box.top) scroller.scrollTop += link.top - box.top;
				else if (link.bottom > box.bottom)
					scroller.scrollTop += link.bottom - box.bottom;
			});
		},
		{ rootMargin: "-10% 0px -75% 0px", threshold: 0 },
	);
	map.forEach((_, h) => io.observe(h));
}

/* ---------- back to top ---------- */
const totop = $("#totop");
if (totop) {
	const onScroll = () => totop.classList.toggle("on", scrollY > 600);
	addEventListener("scroll", onScroll, { passive: true });
	onScroll();
	const goTop = () =>
		scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
	totop.addEventListener("click", goTop);
	totop.addEventListener("keydown", (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			goTop();
		}
	});
}

/* ---------- share ---------- */
$("#share")?.addEventListener("click", async (e) => {
	const btn = e.currentTarget as HTMLButtonElement;
	const data = { title: document.title, url: location.href };
	if (navigator.share) {
		try {
			await navigator.share(data);
		} catch {}
	} else {
		try {
			await navigator.clipboard.writeText(location.href);
			const old = btn.innerHTML;
			btn.textContent = "链接已复制";
			setTimeout(() => (btn.innerHTML = old), 1500);
		} catch {}
	}
});

/* ---------- giscus (lazy) ---------- */
const comments = $("#comments");
function giscusTheme() {
	return currentTheme() === "cloud" ? "light" : "transparent_dark";
}
function syncGiscusTheme() {
	const frame = $<HTMLIFrameElement>("iframe.giscus-frame");
	frame?.contentWindow?.postMessage(
		{ giscus: { setConfig: { theme: giscusTheme() } } },
		"https://giscus.app",
	);
}
function loadGiscus() {
	if (!comments || comments.dataset.loaded) return;
	comments.dataset.loaded = "1";
	const s = document.createElement("script");
	s.src = "https://giscus.app/client.js";
	s.async = true;
	s.crossOrigin = "anonymous";
	const attrs: Record<string, string> = {
		repo: comments.dataset.repo!,
		"repo-id": comments.dataset.repoId!,
		category: comments.dataset.category!,
		"category-id": comments.dataset.categoryId!,
		mapping: comments.dataset.mapping || "pathname",
		strict: "0",
		"reactions-enabled": "1",
		"emit-metadata": "0",
		"input-position": "top",
		theme: giscusTheme(),
		lang: comments.dataset.lang || "zh-CN",
		loading: "lazy",
	};
	for (const [k, v] of Object.entries(attrs)) s.setAttribute(`data-${k}`, v);
	$(".comments__ph", comments)?.remove();
	comments.appendChild(s);
}
if (comments) {
	if ("IntersectionObserver" in window) {
		const io = new IntersectionObserver(
			(en) => {
				if (en.some((x) => x.isIntersecting)) {
					loadGiscus();
					io.disconnect();
				}
			},
			{ rootMargin: "600px" },
		);
		io.observe(comments);
	} else loadGiscus();
}

/* ---------- analytics / ads: after load, when idle ---------- */
const idle = (cb: () => void, timeout = 4000) =>
	"requestIdleCallback" in window
		? (
				window as Window & {
					requestIdleCallback: (
						cb: () => void,
						o?: { timeout: number },
					) => void;
				}
			).requestIdleCallback(cb, { timeout })
		: setTimeout(cb, Math.min(timeout, 1500));

function thirdParty() {
	const cfg =
		(
			window as unknown as {
				__xy?: { ga?: string; clarity?: string; adsense?: string };
			}
		).__xy || {};
	if (cfg.ga) {
		const s = document.createElement("script");
		s.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.ga}`;
		s.async = true;
		document.head.appendChild(s);
		const w = window as unknown as { dataLayer: unknown[] };
		w.dataLayer = w.dataLayer || [];
		const gtag = (...args: unknown[]) => w.dataLayer.push(args);
		gtag("js", new Date());
		gtag("config", cfg.ga);
	}
	if (cfg.clarity) {
		const w = window as unknown as Record<string, unknown>;
		w.clarity =
			w.clarity ||
			function (this: unknown, ...args: unknown[]) {
				((w.clarity as { q: unknown[] }).q =
					(w.clarity as { q: unknown[] }).q || []).push(args);
			};
		const s = document.createElement("script");
		s.src = `https://www.clarity.ms/tag/${cfg.clarity}`;
		s.async = true;
		document.head.appendChild(s);
	}
	if (cfg.adsense) {
		// Ads are the heaviest third-party payload: wait for the first interaction (or 8s) before loading them.
		let done = false;
		const loadAds = () => {
			if (done) return;
			done = true;
			const s = document.createElement("script");
			s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.adsense}`;
			s.async = true;
			s.crossOrigin = "anonymous";
			document.head.appendChild(s);
		};
		for (const ev of ["scroll", "pointerdown", "keydown", "touchstart"])
			addEventListener(ev, loadAds, { once: true, passive: true });
		setTimeout(loadAds, 8000);
	}
}
if (document.readyState === "complete") idle(thirdParty);
else addEventListener("load", () => idle(thirdParty), { once: true });
