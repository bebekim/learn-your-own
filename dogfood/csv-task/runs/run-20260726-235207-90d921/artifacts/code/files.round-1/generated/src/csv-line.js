function parseCsvLine(line) {
  if (line === '') {
    return [''];
  }

  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i += 2;
      } else {
        inQuotes = !inQuotes;
        i += 1;
      }
    } else if (char === ',') {
      if (inQuotes) {
        current += ',';
        i += 1;
      } else {
        result.push(current);
        current = '';
        i += 1;
      }
    } else {
      current += char;
      i += 1;
    }
  }

  result.push(current);
  return result;
}

module.exports = { parseCsvLine };
