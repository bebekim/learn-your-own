/**
 * Parse a single CSV line into an array of fields.
 *
 * Rules:
 * - Fields are split on commas that are not inside double quotes.
 * - A field wrapped in double quotes has the surrounding quotes removed.
 * - Two consecutive double quotes inside a quoted field decode to one literal
 *   double quote.
 * - A quoted field may contain commas, which are preserved.
 * - Parsing an empty string returns a single empty field.
 *
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field.
        current += '"';
        i++; // Skip the second quote.
      } else {
        // Toggle quoted state (opening or closing quote).
        inQuotes = !inQuotes;
      }
    } else if (char === ',') {
      if (inQuotes) {
        current += ',';
      } else {
        fields.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

module.exports = { parseCsvLine };
