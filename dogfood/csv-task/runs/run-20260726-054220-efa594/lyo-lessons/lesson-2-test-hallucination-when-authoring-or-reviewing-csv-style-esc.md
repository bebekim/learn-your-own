# When authoring or reviewing CSV-style escaping tests, manually re-derive the expected output character-by-character from the literal input using the spec's escaping rules before freezing the assertion, since transposed spaces or misplaced characters in expected strings are easy to introduce and hard to spot.

- classification: test-hallucination
- observed in runs: run-20260726-054220-efa594
- disagreements: fields with quotes and commas
- status: candidate

## Rationale
The test 'fields with quotes and commas' feeds the input '"""hello"",""world""" ,a' (i.e. the literal characters """hello"",""world""" followed by a space, comma, and 'a'). Applying the spec's own invariants (opening quote starts a quoted field, "" inside quotes decodes to a literal quote, a lone quote closes the field, and characters outside quotes before the next comma are preserved) to this exact input yields the first field '"hello","world" ' (comma directly between the two escaped-quote groups, with the trailing space from before the outer comma). The test instead expects '"hello", "world"' — a space inserted between the comma and the second quoted group, and no trailing space — which does not correspond to any correct decoding of the given input under the stated escaping rules. The implementation's step-by-step behavior matches the spec's invariants; the test's expected value is simply miscomputed for the input it supplies.

## Evidence
Test: assert.deepEqual(parseCsvLine('\"\"\"hello\"\",\"\"world\"\"\" ,a'), ['\"hello\", \"world\"', 'a']); vs spec invariant 'Two double quotes inside a quoted field decode to one literal double quote' and 'A quoted field may contain commas, which are preserved in the field value', which when applied to the given input produce '\"hello\",\"world\" ' (comma with no space, trailing space at end), not the test's expected string.
