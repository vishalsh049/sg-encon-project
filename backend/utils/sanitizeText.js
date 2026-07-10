// Cleans text coming from Excel/CSV uploads and form input before it is stored.
// Keeps every valid Unicode character (English, Hindi, etc.) - it only repairs
// mojibake and removes invisible characters.
function sanitizeText(value) {
  if (value === undefined || value === null) return "";

  return (
    String(value)
      .normalize("NFC")
      // U+00C2 ("A-circumflex") + U+00A0 (NBSP) is the UTF-8 byte pair of a
      // non-breaking space (C2 A0) mis-decoded as Windows-1252 - repair it
      // back to a normal space
      .replace(/Â /g, " ")
      // real non-breaking spaces -> normal spaces
      .replace(/ /g, " ")
      // zero-width characters and BOM
      .replace(/[​-‍⁠﻿]/g, "")
      // collapse whitespace runs
      .replace(/\s+/g, " ")
      .trim()
  );
}

module.exports = { sanitizeText };
