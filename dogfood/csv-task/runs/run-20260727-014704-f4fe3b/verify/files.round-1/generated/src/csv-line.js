function parseCsvLine(line) {
  if (line === '') {
    return [''];
  }

  const fields = [];
  let current = '';
  let inQuotes = false;
  const len = line.length;

  for (let i = 0; i < len; i++) {
    const char = line[i];

    if (!inQuotes) {
      if (char === ',') {
        fields.push(current);
        current = '';
      } else if (char === '"') {
        inQuotes = true;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        if (i + 1 < len && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

module.exports = { parseCsvLine };
