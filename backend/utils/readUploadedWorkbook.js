const XLSX = require("xlsx");

// XLSX.read decodes BOM-less CSV buffers as Windows-1252, which corrupts UTF-8
// bytes (e.g. a non-breaking space C2 A0 turns into U+00C2 + NBSP). Decode text
// files ourselves so UTF-8 uploads survive intact.
function decodeTextBuffer(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.subarray(3).toString("utf8");
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return Buffer.from(buffer.subarray(2)).swap16().toString("utf16le");
  }

  const utf8 = buffer.toString("utf8");

  // U+FFFD means the bytes were not valid UTF-8 -> legacy ANSI file
  return utf8.includes("�") ? buffer.toString("latin1") : utf8;
}

function readUploadedWorkbook(file) {
  const name = String(file.originalname || "").toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return XLSX.read(decodeTextBuffer(file.buffer), { type: "string" });
  }

  return XLSX.read(file.buffer, { type: "buffer" });
}

module.exports = { readUploadedWorkbook };
