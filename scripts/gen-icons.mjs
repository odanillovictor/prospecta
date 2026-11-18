// Gera os ícones PNG do PWA sem dependências (rasterização por SDF + zlib nativo).
// Uso: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const INK = [0x12, 0x14, 0x17];
const ORANGE = [0xff, 0x4d, 0x1a];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

const sdRoundRect = (x, y, cx, cy, half, r) => {
  const qx = Math.abs(x - cx) - half + r;
  const qy = Math.abs(y - cy) - half + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const cov = (d) => Math.max(0, Math.min(1, 0.5 - d));

// Traço do "S" (espaço 64x64): 3 curvas cúbicas amostradas em polilinha.
const SEGS = [[[41,24],[37,19],[23,20],[23,27]],[[23,27],[23,33],[41,31],[41,38]],[[41,38],[41,45],[27,46],[23,41]]];
const SPINE = [];
for (const [p0,p1,p2,p3] of SEGS) for (let i = 0; i <= 40; i++) { const t = i/40, u = 1-t;
  SPINE.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0], u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]); }
const distSpine = (x, y) => { let best = 1e9;
  for (let i = 0; i < SPINE.length - 1; i++) { const [ax,ay] = SPINE[i], [bx,by] = SPINE[i+1];
    const dx = bx-ax, dy = by-ay; const t = Math.max(0, Math.min(1, ((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
    best = Math.min(best, Math.hypot(x-(ax+t*dx), y-(ay+t*dy))); } return best; };

function render(size, { maskable = false, bgRadius = 0.22 } = {}) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const s = size / 64;
  const scale = maskable ? 0.72 : 1; // maskable: conteúdo dentro da zona segura
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      const bg = maskable ? 1 : cov(sdRoundRect(px, py, size / 2, size / 2, size / 2, size * bgRadius));
      const inner = cov(sdRoundRect(px, py, size / 2, size / 2, 18 * s * scale, 9 * s * scale));
      const ux = 32 + (px / s - 32) / scale, uy = 32 + (py / s - 32) / scale;
      const ring = cov((distSpine(ux, uy) - 2.5) * s * scale);
      let col = INK;
      const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
      col = mix(col, ORANGE, inner);
      col = mix(col, INK, ring * inner);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2]; raw[i + 3] = Math.round(bg * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon-192.png', out), render(192));
writeFileSync(new URL('icon-512.png', out), render(512));
writeFileSync(new URL('icon-maskable-512.png', out), render(512, { maskable: true }));
// iOS aplica a própria máscara arredondada: fundo cheio.
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { maskable: true }));
console.log('Ícones gerados em public/icons/');
