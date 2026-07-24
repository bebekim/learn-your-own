function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes) {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else if (current === '') {
        inQuotes = true;
        i += 1;
      } else {
        current += '"';
        i += 1;
      }
    } else if (char === ',') {
      if (inQuotes) {
        current += ',';
      } else {
        result.push(current);
        current = '';
      }
      i += 1;
    } else {
      current += char;
      i += 1;
    }
  }

  result.push(current);
  return result;
}

module.exports = { parseCsvLine };
