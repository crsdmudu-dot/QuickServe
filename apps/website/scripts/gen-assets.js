// scripts/gen-assets.js
// Generates apps/website/public/og-default.png (1200×630, brand green #00875A)
// and apps/website/public/favicon.ico (32×32, brand green).
// Uses only Node built-ins: zlib, fs, path, Buffer.
// Run once: node scripts/gen-assets.js (from apps/website/).

'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'public');

// ---------------------------------------------------------------------------
// PNG builder (raw, no library)
// ---------------------------------------------------------------------------

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function u8(n) {
  return Buffer.from([n & 0xff]);
}

function crc32(buf) {
  // Build CRC table
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crc = crc32(crcBuf);
  return Buffer.concat([u32be(data.length), typeBytes, data, u32be(crc)]);
}

function makePng(width, height, r, g, b) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bitDepth=8, colorType=2 (RGB), compression=0, filter=0, interlace=0
  const ihdrData = Buffer.concat([
    u32be(width),
    u32be(height),
    u8(8), // bit depth
    u8(2), // RGB
    u8(0), u8(0), u8(0),
  ]);
  const ihdr = pngChunk('IHDR', ihdrData);

  // Build raw image data: each row = filter byte (0) + RGB pixels
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const base = y * rowSize;
    raw[base] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      raw[base + 1 + x * 3] = r;
      raw[base + 1 + x * 3 + 1] = g;
      raw[base + 1 + x * 3 + 2] = b;
    }
  }

  // Compress with zlib (deflate)
  const compressed = zlib.deflateSync(raw, { level: 6 });
  const idat = pngChunk('IDAT', compressed);

  // IEND
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ---------------------------------------------------------------------------
// ICO builder (single 32×32 RGBA image)
// ---------------------------------------------------------------------------

function makeFaviconIco(r, g, b) {
  const size = 32;

  // Build a 32×32 PNG for the ICO image data
  const pngData = makePng(size, size, r, g, b);

  // ICO header: reserved(2) + type(2=1 for icon) + count(2)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: 1 = ICO
  header.writeUInt16LE(1, 4);   // count: 1 image

  // Directory entry: 16 bytes per image
  // width(1) height(1) colorCount(1) reserved(1) planes(2) bitCount(2) sizeInBytes(4) offset(4)
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size, 0);       // width (0 means 256, use 32)
  dirEntry.writeUInt8(size, 1);       // height
  dirEntry.writeUInt8(0, 2);          // colorCount (0 = no palette)
  dirEntry.writeUInt8(0, 3);          // reserved
  dirEntry.writeUInt16LE(1, 4);       // planes
  dirEntry.writeUInt16LE(24, 6);      // bitCount (24bpp for RGB PNG)
  dirEntry.writeUInt32LE(pngData.length, 8);  // size of image data
  dirEntry.writeUInt32LE(6 + 16, 12); // offset: header(6) + one dir entry(16)

  return Buffer.concat([header, dirEntry, pngData]);
}

// ---------------------------------------------------------------------------
// Generate files
// ---------------------------------------------------------------------------

// Brand green: #00875A → R=0, G=135, B=90
const R = 0x00;
const G = 0x87;
const B = 0x5a;

console.log('Generating og-default.png (1200×630)…');
const ogPng = makePng(1200, 630, R, G, B);
fs.writeFileSync(path.join(OUT_DIR, 'og-default.png'), ogPng);
console.log(`  Written: ${ogPng.length} bytes`);

console.log('Generating favicon.ico (32×32)…');
const ico = makeFaviconIco(R, G, B);
fs.writeFileSync(path.join(OUT_DIR, 'favicon.ico'), ico);
console.log(`  Written: ${ico.length} bytes`);

console.log('Done. Assets written to public/.');
