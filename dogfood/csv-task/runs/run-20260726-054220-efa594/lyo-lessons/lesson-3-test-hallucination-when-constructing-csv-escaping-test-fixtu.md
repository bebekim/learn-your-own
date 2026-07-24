# When constructing CSV/escaping test fixtures in a host language, verify the actual runtime string (after the host language's own escape processing) matches the CSV-level escaping rules the spec defines, rather than assuming the source literal's visual appearance reflects the intended CSV semantics.

- classification: test-hallucination
- observed in runs: run-20260726-054220-efa594
- disagreements: quoted field containing commas and quotes
- status: candidate

## Rationale
The spec's invariants (split on unquoted commas, strip surrounding quotes, decode doubled quotes to one literal quote) are deterministic and are correctly implemented by csv-line.js, which passes every other example and edge case in the spec, including the properly-escaped nested-quote cases ('escaped double quotes inside quoted field', 'fields with quotes and commas', 'mixed quoted and unquoted fields'). The disputed test's literal `'"a,b,\"c,d\"",e'` does not actually encode a properly RFC4180-escaped field (the author needed `""c,d""` to double-escape the inner quotes but instead wrote single, non-doubled quotes around c,d). Applying the spec's stated rules mechanically to the actual runtime string yields `['a,b,c','d','e']`, exactly what the implementation returns. The test's expected value `['a,b,"c,d"', 'e']` can only be produced by an undocumented, non-standard 'keep stray quotes literal unless doubled-and-followed-by-delimiter' algorithm that the spec never states and that contradicts invariant 3 ('Two double quotes ... decode to one literal double quote'), since the test simultaneously expects the interior quotes to survive unescaped rather than being paired/decoded.

## Evidence
Spec invariant: 'Two double quotes inside a quoted field decode to one literal double quote.' Test: `assert.deepEqual(parseCsvLine('"a,b,\"c,d\"",e'), ['a,b,"c,d"', 'e']);` — the runtime string here (after JS unescaping) contains single, non-doubled quotes around c,d, so no invariant in the spec supports collapsing/merging it into one field with embedded quotes preserved.
