function parseCsvLine(line) {
  if (line === '') {
    return [''];
  }

  const fields = [];
  let current = '';
  let inQuotes = false;
  let expectFieldStart = true;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (expectFieldStart) {
      if (char === '"') {
        inQuotes = true;
        expectFieldStart = false;
      } else if (char === ',') {
        fields.push('');
      } else {
        current += char;
        expectFieldStart = false;
      }
    } else {
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === ',') {
          fields.push(current);
          current = '';
          expectFieldStart = true;
        } else {
          current += char;
        }
      }
    }
  }

  fields.push(current);
  return fields;
}

module.exports = { parseCsvLine };
