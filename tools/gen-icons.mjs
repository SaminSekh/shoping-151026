import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'assets');

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

const lerp = (a, b, t) => a + (b - a) * t;

function inRoundedSquare(u, v, radius) {
    const cx = Math.min(Math.max(u, radius), 1 - radius);
    const cy = Math.min(Math.max(v, radius), 1 - radius);
    const dx = u - cx;
    const dy = v - cy;
    return dx * dx + dy * dy <= radius * radius;
}

function inLetterN(u, v, scale) {
    const left = 0.5 - 0.20 * scale;
    const right = 0.5 + 0.20 * scale;
    const halfBar = 0.058 * scale;
    const top = 0.5 - 0.24 * scale;
    const bottom = 0.5 + 0.24 * scale;

    if (v < top || v > bottom) return false;

    if (u >= left - halfBar && u <= left + halfBar) return true;
    if (u >= right - halfBar && u <= right + halfBar) return true;

    const span = right - left;
    const t = (v - top) / (bottom - top);
    const centre = left + t * span;
    return Math.abs(u - centre) <= halfBar;
}

function buildIcon(size, { radius, glyphScale }) {
    const rgba = Buffer.alloc(size * size * 4);
    const SS = 3;

    const topR = 0x63, topG = 0x66, topB = 0xf1;
    const botR = 0x43, botG = 0x38, botB = 0xca;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let bgHits = 0;
            let glyphHits = 0;

            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const u = (x + (sx + 0.5) / SS) / size;
                    const v = (y + (sy + 0.5) / SS) / size;

                    if (radius > 0 ? inRoundedSquare(u, v, radius) : u >= 0 && u <= 1 && v >= 0 && v <= 1) bgHits++;
                    if (inLetterN(u, v, glyphScale)) glyphHits++;
                }
            }

            const total = SS * SS;
            const bgA = bgHits / total;
            const glyphA = glyphHits / total;

            const t = y / (size - 1);
            let r = lerp(topR, botR, t);
            let g = lerp(topG, botG, t);
            let b = lerp(topB, botB, t);

            const gr = 255, gg = 255, gb = 255;
            const alpha = bgA * 255;
            const mix = glyphA;

            const finalR = lerp(r, gr, mix);
            const finalG = lerp(g, gg, mix);
            const finalB = lerp(b, gb, mix);

            const i = (y * size + x) * 4;
            rgba[i] = Math.round(finalR);
            rgba[i + 1] = Math.round(finalG);
            rgba[i + 2] = Math.round(finalB);
            rgba[i + 3] = Math.round(alpha);
        }
    }

    return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
    ['icon-192.png', 192, { radius: 0.22, glyphScale: 1 }],
    ['icon-512.png', 512, { radius: 0.22, glyphScale: 1 }],
    ['icon-maskable-512.png', 512, { radius: 0, glyphScale: 0.72 }]
];

for (const [name, size, opts] of targets) {
    const png = buildIcon(size, opts);
    writeFileSync(resolve(OUT_DIR, name), png);
    console.log(`wrote assets/${name} (${size}x${size}, ${png.length} bytes)`);
}