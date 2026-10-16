/**
 * 背景粒子网络：纯 SVG（节点 <circle> + 连线 <path>），节点之间弹性碰撞，碰撞处扩散出光环。
 * 鼠标靠近会把节点推开，点击产生一圈冲击波。
 *
 * 性能策略：连线按透明度分 3 桶，每桶一个 <path>，每帧只写 3 个 d 属性；
 * 移动端 / 低配设备 30fps；prefers-reduced-motion 或 saveData 时只画静态一帧。
 */
interface Node {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
	flash: number;
	el: SVGCircleElement;
}

const NS = "http://www.w3.org/2000/svg";
const BUCKET_OPACITY = [0.12, 0.3, 0.55];

export function startNetwork(svg: SVGSVGElement) {
	const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
	const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches || !!nav.connection?.saveData;
	const lowEnd = (nav.deviceMemory !== undefined && nav.deviceMemory < 4) || (navigator.hardwareConcurrency || 8) <= 4;

	let W = innerWidth;
	let H = innerHeight;
	let LINK = 150;
	const nodes: Node[] = [];
	const gLines = document.createElementNS(NS, "g");
	const gNodes = document.createElementNS(NS, "g");
	const gRings = document.createElementNS(NS, "g");
	const paths = BUCKET_OPACITY.map((o) => {
		const p = document.createElementNS(NS, "path");
		p.setAttribute("stroke-opacity", String(o));
		p.setAttribute("fill", "none");
		gLines.appendChild(p);
		return p;
	});
	const rings: SVGCircleElement[] = [];
	let ringIdx = 0;
	for (let i = 0; i < 5; i++) {
		const c = document.createElementNS(NS, "circle");
		c.setAttribute("class", "ring");
		c.setAttribute("r", "1");
		gRings.appendChild(c);
		rings.push(c);
	}
	svg.append(gLines, gNodes, gRings);

	const pointer = { x: -1e4, y: -1e4 };
	const rand = (a: number, b: number) => a + Math.random() * (b - a);
	let lastRing = 0;

	function targetCount() {
		const n = Math.floor((W * H) / 26000);
		const cap = W < 640 ? 16 : lowEnd ? 26 : 46;
		return Math.max(12, Math.min(cap, n));
	}

	function addNode() {
		const r = rand(1.6, 3.4);
		const el = document.createElementNS(NS, "circle");
		el.setAttribute("r", r.toFixed(2));
		el.setAttribute("fill-opacity", "0.9");
		gNodes.appendChild(el);
		const a = rand(0, Math.PI * 2);
		const s = rand(14, 42);
		nodes.push({ x: rand(0, W), y: rand(0, H), vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, flash: 0, el });
	}

	function resize() {
		W = innerWidth;
		H = innerHeight;
		LINK = W < 640 ? 110 : 150;
		svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
		const want = targetCount();
		while (nodes.length < want) addNode();
		while (nodes.length > want) nodes.pop()?.el.remove();
		for (const n of nodes) {
			n.x = Math.min(Math.max(n.x, n.r), W - n.r);
			n.y = Math.min(Math.max(n.y, n.r), H - n.r);
		}
	}

	function ring(x: number, y: number, r: number, now: number, force = false) {
		if (!force && now - lastRing < 120) return;
		lastRing = now;
		const c = rings[ringIdx++ % rings.length];
		c.setAttribute("cx", x.toFixed(0));
		c.setAttribute("cy", y.toFixed(0));
		c.setAttribute("r", r.toFixed(0));
		if (typeof c.animate === "function") {
			c.animate(
				[
					{ opacity: 0.9, transform: "scale(0.2)" },
					{ opacity: 0, transform: "scale(1)" },
				],
				{ duration: 700, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" },
			);
		}
	}

	function step(dt: number, now: number) {
		for (const n of nodes) {
			const dx = n.x - pointer.x;
			const dy = n.y - pointer.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < 140 * 140 && d2 > 1) {
				const d = Math.sqrt(d2);
				const f = ((140 - d) / 140) * 60 * dt;
				n.vx += (dx / d) * f;
				n.vy += (dy / d) * f;
			}
			const sp = n.vx * n.vx + n.vy * n.vy;
			if (sp > 90 * 90) {
				n.vx *= 0.97;
				n.vy *= 0.97;
			} else if (sp < 10 * 10) {
				n.vx *= 1.03;
				n.vy *= 1.03;
			}
			n.x += n.vx * dt;
			n.y += n.vy * dt;
			if (n.x < n.r) {
				n.x = n.r;
				n.vx = Math.abs(n.vx);
			} else if (n.x > W - n.r) {
				n.x = W - n.r;
				n.vx = -Math.abs(n.vx);
			}
			if (n.y < n.r) {
				n.y = n.r;
				n.vy = Math.abs(n.vy);
			} else if (n.y > H - n.r) {
				n.y = H - n.r;
				n.vy = -Math.abs(n.vy);
			}
			n.flash *= 0.9;
		}

		const d = ["", "", ""];
		const L2 = LINK * LINK;
		for (let i = 0; i < nodes.length; i++) {
			const a = nodes[i];
			for (let j = i + 1; j < nodes.length; j++) {
				const b = nodes[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const d2 = dx * dx + dy * dy;
				if (d2 > L2) continue;
				const dist = Math.sqrt(d2) || 0.001;
				const minD = a.r + b.r + 2;
				if (dist < minD) {
					// elastic collision between equal masses: swap the velocity components along the normal
					const nx = dx / dist;
					const ny = dy / dist;
					const pa = a.vx * nx + a.vy * ny;
					const pb = b.vx * nx + b.vy * ny;
					if (pa - pb > 0) {
						a.vx += (pb - pa) * nx;
						a.vy += (pb - pa) * ny;
						b.vx += (pa - pb) * nx;
						b.vy += (pa - pb) * ny;
						a.flash = b.flash = 1;
						ring(a.x + dx / 2, a.y + dy / 2, 14 + Math.abs(pa - pb) * 0.25, now);
					}
					const push = (minD - dist) / 2;
					a.x -= nx * push;
					a.y -= ny * push;
					b.x += nx * push;
					b.y += ny * push;
				}
				const bucket = Math.min(2, Math.floor((1 - dist / LINK) * 3));
				d[bucket] += `M${a.x.toFixed(0)} ${a.y.toFixed(0)}L${b.x.toFixed(0)} ${b.y.toFixed(0)}`;
			}
		}
		for (let k = 0; k < 3; k++) paths[k].setAttribute("d", d[k] || "M0 0");
		for (const n of nodes) {
			n.el.setAttribute("transform", `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
			if (n.flash > 0.02) n.el.setAttribute("r", (n.r * (1 + n.flash * 1.6)).toFixed(2));
			else if (n.flash !== 0) {
				n.flash = 0;
				n.el.setAttribute("r", n.r.toFixed(2));
			}
		}
	}

	resize();
	step(0, 0);
	if (reduced) return;

	const frameMs = W < 1024 || lowEnd ? 1000 / 30 : 0;
	let last = performance.now();
	let acc = 0;
	let raf = 0;
	function frame(now: number) {
		raf = requestAnimationFrame(frame);
		const elapsed = now - last;
		if (elapsed < frameMs) return;
		last = now;
		acc = Math.min(0.05, elapsed / 1000);
		step(acc, now);
	}

	addEventListener("resize", resize, { passive: true });
	addEventListener(
		"pointermove",
		(e) => {
			pointer.x = e.clientX;
			pointer.y = e.clientY;
		},
		{ passive: true },
	);
	addEventListener("pointerleave", () => {
		pointer.x = pointer.y = -1e4;
	});
	addEventListener(
		"pointerdown",
		(e) => {
			ring(e.clientX, e.clientY, 90, performance.now(), true);
			for (const n of nodes) {
				const dx = n.x - e.clientX;
				const dy = n.y - e.clientY;
				const dist = Math.hypot(dx, dy) || 1;
				if (dist < 240) {
					const f = ((240 - dist) / 240) * 160;
					n.vx += (dx / dist) * f;
					n.vy += (dy / dist) * f;
				}
			}
		},
		{ passive: true },
	);
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) cancelAnimationFrame(raf);
		else {
			last = performance.now();
			raf = requestAnimationFrame(frame);
		}
	});
	raf = requestAnimationFrame(frame);
}
