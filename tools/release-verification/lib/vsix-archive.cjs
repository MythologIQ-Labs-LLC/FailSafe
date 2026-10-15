/**
 * Wave 0 (#521): the one zip reader in tools/release-verification.
 *
 * Reads the central directory of a VSIX held in memory. Supports stored and
 * deflate entries, rejects ZIP64, absolute or ".." entry names, and caps both
 * the archive and every inflated entry so a hostile download cannot exhaust
 * memory.
 */
"use strict";

const fs = require("fs");
const zlib = require("zlib");

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

class ArchiveError extends Error {}

function findEocd(buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new ArchiveError("not a zip archive (no end-of-central-directory record)");
}

/** @returns {{ names: string[], has(name: string): boolean, read(name: string): Buffer }} */
function openArchive(buf, { maxEntryBytes = MAX_ENTRY_BYTES } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ArchiveError("not a zip archive (too short)");
  if (buf.length > MAX_ARCHIVE_BYTES) throw new ArchiveError(`archive is ${buf.length} bytes, over the ${MAX_ARCHIVE_BYTES}-byte cap`);
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || p === 0xffffffff) throw new ArchiveError("ZIP64 archives are not supported");
  if (p + cdSize > eocd) throw new ArchiveError("central directory lies outside the archive");
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ArchiveError(`bad central directory entry ${i}`);
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) throw new ArchiveError(`unsafe entry name ${name}`);
    entries.set(name, { method, compressed, size, local });
  }
  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    read(name) {
      const e = entries.get(name);
      if (!e) throw new ArchiveError(`entry not found: ${name}`);
      if (e.size > maxEntryBytes) throw new ArchiveError(`${name} inflates to ${e.size} bytes, over the ${maxEntryBytes}-byte cap`);
      if (e.local + 30 > buf.length || buf.readUInt32LE(e.local) !== 0x04034b50) throw new ArchiveError(`bad local header for ${name}`);
      const start = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      if (start + e.compressed > buf.length) throw new ArchiveError(`${name} is truncated`);
      const data = buf.subarray(start, start + e.compressed);
      let out;
      if (e.method === 0) out = Buffer.from(data);
      else if (e.method === 8) {
        try {
          out = zlib.inflateRawSync(data, { maxOutputLength: maxEntryBytes });
        } catch (err) {
          throw new ArchiveError(`${name} does not inflate: ${err.message}`);
        }
      } else throw new ArchiveError(`unsupported compression ${e.method} for ${name}`);
      if (out.length !== e.size) throw new ArchiveError(`${name} inflated to ${out.length} bytes; the directory says ${e.size}`);
      return out;
    },
  };
}

function readArchiveFile(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_ARCHIVE_BYTES) throw new ArchiveError(`${file} is ${size} bytes, over the ${MAX_ARCHIVE_BYTES}-byte cap`);
  return fs.readFileSync(file);
}

module.exports = { ArchiveError, openArchive, readArchiveFile, MAX_ARCHIVE_BYTES, MAX_ENTRY_BYTES };
