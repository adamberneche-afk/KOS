'use strict';
// Zip reading and writing on Node's built-in zlib, for every tool that opens
// or makes a zip (structure audit 3.9, 2026-11-21: there were three readers,
// each with its own crc32). The repo has no npm dependencies (package.json).
//
// The reader is student-data-scan's, the hardened one: zip64, bounds-checked,
// a size cap per member, and ZipError with a short reason, never file content,
// when a container can't be opened. Stored (0) and deflate (8) only.
// The writer is the Canvas cartridge builder's: every entry deflated and
// stamped with one fixed date, so the same input gives the same bytes (the
// --check modes compare bytes).
//
// Not used by tools/clasp-sync/run.js, which keeps its own reader on purpose:
// the operator runs a copy of run.js outside the checkout, and it extracts the
// GitHub zip before any checkout (and so this file) exists.

const zlib = require('zlib');

class ZipError extends Error {}

let CRC_TABLE = null;
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u64(buf, off) {
  const v = buf.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('zip64 size out of range');
  return Number(v);
}

// The member list: [{ name, flags, method, crc, csize, usize, offset }].
function zipEntries(buf) {
  if (buf.length < 22) throw new ZipError('too short to be a zip');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new ZipError('no zip directory: not a zip, or encrypted');
  let count = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOff = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new ZipError('zip64 locator missing');
    const z = u64(buf, loc + 8);
    if (z + 56 > buf.length || buf.readUInt32LE(z) !== 0x06064b50) throw new ZipError('zip64 directory missing');
    count = u64(buf, z + 32);
    cdSize = u64(buf, z + 40);
    cdOff = u64(buf, z + 48);
  }
  if (cdOff + cdSize > buf.length) throw new ZipError('directory past end of file');
  const out = [];
  let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('bad directory entry');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const e = {
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      crc: buf.readUInt32LE(p + 16),
      csize: buf.readUInt32LE(p + 20),
      usize: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
    };
    // zip64 extra field: the fields set to 0xffffffff, in order usize, csize, offset.
    let x = p + 46 + nameLen;
    const xEnd = Math.min(x + extraLen, buf.length);
    while (x + 4 <= xEnd) {
      const id = buf.readUInt16LE(x);
      const len = buf.readUInt16LE(x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        ['usize', 'csize', 'offset'].forEach((f) => {
          if (e[f] === 0xffffffff && q + 8 <= Math.min(x + 4 + len, xEnd)) { e[f] = u64(buf, q); q += 8; }
        });
      }
      x += 4 + len;
    }
    out.push(e);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// One member's bytes; null when it is over `cap` uncompressed. Throws
// ZipError when it can't be read.
function zipRead(buf, e, cap) {
  if (e.flags & 1) throw new ZipError('encrypted member');
  if (e.usize > cap) return null;
  const h = e.offset;
  if (h + 30 > buf.length || buf.readUInt32LE(h) !== 0x04034b50) throw new ZipError('bad local header');
  const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
  if (start + e.csize > buf.length) throw new ZipError('member past end of file');
  const raw = buf.subarray(start, start + e.csize);
  let data;
  if (e.method === 0) data = raw;
  else if (e.method === 8) {
    try {
      data = zlib.inflateRawSync(raw, Number.isFinite(cap) ? { maxOutputLength: cap + 1 } : {});
    } catch (err) {
      if (err.code === 'ERR_BUFFER_TOO_LARGE') return null;
      throw new ZipError('deflate data corrupt');
    }
  } else throw new ZipError('unsupported compression method ' + e.method);
  if (data.length > cap) return null;
  if (data.length !== e.usize || crc32(data) !== e.crc) throw new ZipError('checksum mismatch');
  return data;
}

// { "path/in/zip": Buffer } for every file entry (directories skipped). No
// size cap: for the repo's own inputs (.docx lesson plans), not for scanning.
function readZip(buf) {
  const out = {};
  zipEntries(buf).forEach((e) => {
    if (e.name.endsWith('/')) return;
    out[e.name] = Buffer.from(zipRead(buf, e, Infinity));
  });
  return out;
}

// 2026-01-01 00:00, in DOS date/time form.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** A zip of [[path, Buffer|string], ...], entries in the order given. */
function writeZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  entries.forEach(([name, content]) => {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6); // UTF-8 names
    h.writeUInt16LE(8, 8);
    h.writeUInt16LE(DOS_TIME, 10);
    h.writeUInt16LE(DOS_DATE, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);
    locals.push(h, nameBuf, comp);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(DOS_TIME, 12);
    c.writeUInt16LE(DOS_DATE, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += h.length + nameBuf.length + comp.length;
  });
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

module.exports = { ZipError, crc32, zipEntries, zipRead, readZip, writeZip };
