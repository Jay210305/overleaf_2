import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

/**
 * Minimal in-test ZIP fixture builder. Writes stored/deflated entries with
 * exact central-directory control so hostile archives (traversal names,
 * forged CRC/sizes, symlink attributes, encrypted flags) are expressible
 * without a third-party writer.
 */
export type ZipFixtureEntry = {
  name: string;
  data?: Uint8Array | string | undefined;
  method?: number | undefined;
  crcOverride?: number | undefined;
  sizesOverride?: { compressed: number; uncompressed: number } | undefined;
  unixMode?: number | undefined;
  generalPurposeBitFlag?: number | undefined;
};

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(data: Uint8Array | string | undefined): Buffer {
  if (data === undefined) return Buffer.alloc(0);
  return typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildZip(entries: ZipFixtureEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = toBytes(entry.data);
    const method = entry.method ?? 0;
    const fileData = method === 8 ? deflateSync(raw) : raw;
    const crc = entry.crcOverride ?? crc32(raw);
    const sizes = entry.sizesOverride ?? {
      compressed: fileData.length,
      uncompressed: raw.length,
    };
    const gpFlag = entry.generalPurposeBitFlag ?? 0;
    const externalAttributes = (entry.unixMode ?? 0) << 16;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(gpFlag, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(sizes.compressed >>> 0, 18);
    local.writeUInt32LE(sizes.uncompressed >>> 0, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    chunks.push(local, fileData);
    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(gpFlag, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(crc >>> 0, 16);
    header.writeUInt32LE(sizes.compressed >>> 0, 20);
    header.writeUInt32LE(sizes.uncompressed >>> 0, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(externalAttributes >>> 0, 38);
    header.writeUInt32LE(offset >>> 0, 42);
    name.copy(header, 46);
    central.push(header);
    offset += local.length + fileData.length;
  }
  const centralStart = offset;
  const centralBytes = Buffer.concat(central);
  chunks.push(centralBytes);
  offset += centralBytes.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);
  return Buffer.concat(chunks);
}

function chunkCrc(data: Buffer, type: string): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])) >>> 0, 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

/** Minimal 1x1 PNG that passes the upload content policy. */
export function minimalPng(): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const idat = deflateSync(Buffer.from([0, 255, 0, 0]));
  return Buffer.concat([
    signature,
    chunkCrc(ihdr, "IHDR"),
    chunkCrc(idat, "IDAT"),
    chunkCrc(Buffer.alloc(0), "IEND"),
  ]);
}
