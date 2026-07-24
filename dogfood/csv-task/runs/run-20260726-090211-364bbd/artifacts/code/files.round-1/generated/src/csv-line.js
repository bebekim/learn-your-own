function parseCsvLine(line) {
  if (line === '') {
    return [''];
  }

  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        current += char;
        i += 1;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i += 1;
      } else if (char === ',') {
        fields.push(current);
        current = '';
        i += 1;
      } else {
        current += char;
        i += 1;
      }
    }
  }

  fields.push(current);
  return fields;
}

module.exports = { parseCsvLine };
