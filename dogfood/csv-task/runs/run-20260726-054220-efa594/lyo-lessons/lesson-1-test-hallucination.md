# When writing tests for edge cases involving ambiguous or non-standard input sequences (e.g., multiple adjacent quote runs at field boundaries), derive the expected output by mechanically applying the spec's stated invariants step-by-step rather than guessing a plausible-looking result.

- classification: test-hallucination
- observed in runs: run-20260726-054220-efa594
- disagreements: quoted field with escaped quotes at start; fields with quotes and commas; quoted field containing commas and quotes
- status: candidate

## Rationale
The spec's invariants only define simple, unambiguous quoting behavior (single quoted field, doubled quotes decode to one literal quote) and its examples cover only these simple cases. The implementation applies these invariants via the standard, consistent state-machine algorithm: a quote is either an opening/closing delimiter or, if doubled, an escaped literal quote; a lone quote not followed by another quote closes the quoted section and any subsequent quote reopens quoting. Applying this consistently to the disputed input '""""a"""" ,x' (i.e. """"a"""" ,x) yields ['"a" ', 'x'], which is what the code produces. The test instead expects ['""a""', 'x'], a value that cannot be derived by any consistent application of the stated invariants (it implies a different quote-pairing count on each side of 'a' and silently drops the trailing space with no stated rule for that). This is an edge case involving multiple consecutive quote runs at field boundaries that the spec never specifies, and the test's chosen expectation is an invented, internally inconsistent behavior rather than a defensible reading of the invariants.

## Evidence
Spec invariant: "Two double quotes inside a quoted field decode to one literal double quote" — applied consistently by the code's `if (inQuotes && line[i+1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }` logic, giving parseCsvLine('""""a"""" ,x') === ['"a" ', 'x'], whereas the test asserts `assert.deepEqual(parseCsvLine('\"\"\"\"a\"\"\"\" ,x'), ['\"\"a\"\"', 'x'])`.

## Suggested spec edit
Add an explicit rule and worked example describing how sequences of more than two consecutive double quotes at the start or end of a quoted field should be parsed (e.g., pairing left-to-right, and whether a lone unmatched quote closes the field even if followed by non-delimiter characters).
