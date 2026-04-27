const encoder = new TextEncoder();

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function getCrc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, value >>> 0, true);
  return bytes;
}

function uint16(value) {
  const bytes = new Uint8Array(2);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, value, true);
  return bytes;
}

function concatBytes(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function normalizeBytes(bytes) {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

export function createZipArchive(entries) {
  const localParts = [];
  const centralParts = [];
  const { dosDate, dosTime } = getDosDateTime();
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const contentBytes = normalizeBytes(entry.bytes);
    const crc32 = getCrc32(contentBytes);
    const localHeader = concatBytes([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc32),
      uint32(contentBytes.length),
      uint32(contentBytes.length),
      uint16(nameBytes.length),
      uint16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, contentBytes);
    centralParts.push(
      concatBytes([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0),
        uint16(0),
        uint16(dosTime),
        uint16(dosDate),
        uint32(crc32),
        uint32(contentBytes.length),
        uint32(contentBytes.length),
        uint16(nameBytes.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        nameBytes,
      ]),
    );
    offset += localHeader.length + contentBytes.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const localFiles = concatBytes(localParts);
  const endOfCentralDirectory = concatBytes([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(localFiles.length),
    uint16(0),
  ]);

  return concatBytes([localFiles, centralDirectory, endOfCentralDirectory]);
}
