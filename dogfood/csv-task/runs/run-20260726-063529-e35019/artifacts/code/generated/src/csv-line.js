/**
 * Parse a single CSV line into an array of fields.
 *
 * Rules:
 * - Fields are split on commas that are not inside double quotes.
 * - Surrounding double quotes are removed from quoted fields.
 * - Two consecutive double quotes inside a quoted field decode to one literal double quote.
 * - A quoted field may contain commas, which become part of the field value.
 * - An empty input string returns a single empty field: [''].
 *
 * @param {string} line The CSV line to parse.
 * @returns {string[]} The parsed fields.
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  const n = line.length;

  while (i < n) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes) {
        // Inside a quoted field: "" means a literal quote, otherwise this quote closes the field.
        if (i + 1 < n && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        // Start of a quoted field.
        inQuotes = true;
        i += 1;
      }
    } else if (ch === ',') {
      if (inQuotes) {
        current += ',';
        i += 1;
      } else {
        fields.push(current);
        current = '';
        i += 1;
      }
    } else {
      current += ch;
      i += 1;
    }
  }

  fields.push(current);
  return fields;
}

module.exports = parseCsvLine;
module.exports.parseCsvLine = parseCsvLine;
