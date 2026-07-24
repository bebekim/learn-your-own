/**
 * Parse a single CSV line according to the csv-parse-line-1 specification.
 *
 * @param {string} line
 * @returns {string[]}
 */
function parseCsvLine(line) {
  if (line === "") {
    return [""];
  }

  const fields = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes) {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        inQuotes = true;
      }
      i += 1;
    } else if (char === ",") {
      if (inQuotes) {
        current += ",";
      } else {
        fields.push(current);
        current = "";
      }
      i += 1;
    } else {
      current += char;
      i += 1;
    }
  }

  fields.push(current);
  return fields;
}

module.exports = parseCsvLine;
