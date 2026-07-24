function parseCsvLine(line) {
  if (line === '') {
    return [''];
  }

  const fields = [];
  let current = '';
  let quoted = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (quoted) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          quoted = false;
          i += 1;
        }
      } else {
        current += char;
        i += 1;
      }
    } else {
      if (char === ',') {
        fields.push(current);
        current = '';
        i += 1;
      } else if (char === '"') {
        quoted = true;
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
