import fs from "node:fs";
import path from "node:path";

export interface ImageSize {
	width: number;
	height: number;
}

/**
 * Reads the pixel dimensions of a PNG / JPEG / GIF / WebP file from its header.
 * Dependency-free so the build does not need sharp just to avoid layout shift.
 */
export function readImageSize(file: string): ImageSize | null {
	let buf: Buffer;
	try {
		const fd = fs.openSync(file, "r");
		buf = Buffer.alloc(64 * 1024);
		const n = fs.readSync(fd, buf, 0, buf.length, 0);
		fs.closeSync(fd);
		buf = buf.subarray(0, n);
	} catch {
		return null;
	}
	if (buf.length < 24) return null;

	// PNG
	if (buf.readUInt32BE(0) === 0x89504e47) {
		return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	}
	// GIF
	if (buf.toString("ascii", 0, 3) === "GIF") {
		return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
	}
	// WebP
	if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
		const chunk = buf.toString("ascii", 12, 16);
		if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
		if (chunk === "VP8L") {
			const b = buf.readUInt32LE(21);
			return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
		}
		if (chunk === "VP8X") {
			return {
				width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
				height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
			};
		}
	}
	// JPEG: walk the segments until a SOF marker
	if (buf[0] === 0xff && buf[1] === 0xd8) {
		let off = 2;
		while (off + 9 < buf.length) {
			if (buf[off] !== 0xff) {
				off++;
				continue;
			}
			const marker = buf[off + 1];
			if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				off += 2;
				continue;
			}
			const len = buf.readUInt16BE(off + 2);
			const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
			if (isSOF) {
				return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
			}
			off += 2 + len;
		}
	}
	return null;
}

const cache = new Map<string, ImageSize | null>();

/** Resolves a `/upload/...` style public path to its pixel size (cached per build). */
export function publicImageSize(src: string): ImageSize | null {
	if (!src || !src.startsWith("/")) return null;
	if (cache.has(src)) return cache.get(src) ?? null;
	const file = path.join(process.cwd(), "public", decodeURIComponent(src.split(/[?#]/)[0]));
	const size = readImageSize(file);
	cache.set(src, size);
	return size;
}
