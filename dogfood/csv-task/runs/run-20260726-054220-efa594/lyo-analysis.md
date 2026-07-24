# LYO Run Analysis

## Run run-20260726-054220-efa594

### Disagreement 1: quoted field with escaped quotes at start

- classification: **test-hallucination**
- rationale: The spec's invariants only define simple, unambiguous quoting behavior (single quoted field, doubled quotes decode to one literal quote) and its examples cover only these simple cases. The implementation applies these invariants via the standard, consistent state-machine algorithm: a quote is either an opening/closing delimiter or, if doubled, an escaped literal quote; a lone quote not followed by another quote closes the quoted section and any subsequent quote reopens quoting. Applying this consistently to the disputed input '""""a"""" ,x' (i.e. """"a"""" ,x) yields ['"a" ', 'x'], which is what the code produces. The test instead expects ['""a""', 'x'], a value that cannot be derived by any consistent application of the stated invariants (it implies a different quote-pairing count on each side of 'a' and silently drops the trailing space with no stated rule for that). This is an edge case involving multiple consecutive quote runs at field boundaries that the spec never specifies, and the test's chosen expectation is an invented, internally inconsistent behavior rather than a defensible reading of the invariants.
- evidence: `Spec invariant: "Two double quotes inside a quoted field decode to one literal double quote" — applied consistently by the code's `if (inQuotes && line[i+1] === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }` logic, giving parseCsvLine('""""a"""" ,x') === ['"a" ', 'x'], whereas the test asserts `assert.deepEqual(parseCsvLine('\"\"\"\"a\"\"\"\" ,x'), ['\"\"a\"\"', 'x'])`.`
- lesson: When writing tests for edge cases involving ambiguous or non-standard input sequences (e.g., multiple adjacent quote runs at field boundaries), derive the expected output by mechanically applying the spec's stated invariants step-by-step rather than guessing a plausible-looking result.
- suggested spec edit: Add an explicit rule and worked example describing how sequences of more than two consecutive double quotes at the start or end of a quoted field should be parsed (e.g., pairing left-to-right, and whether a lone unmatched quote closes the field even if followed by non-delimiter characters).

<details><summary>verifier output</summary>

```
(verifier output not available)
```
</details>

### Disagreement 2: fields with quotes and commas

- classification: **test-hallucination**
- rationale: The test's expected value cannot be produced from its own input string by any parser that implements the spec's stated invariants (unquoted-comma splitting, quote-stripping, "" -> literal quote, comma-preservation inside quotes). Decoding the literal input '"""hello"",""world""" ,a' character-by-character under the doubled-quote-escape rule yields '"hello","world" ' (no space after the internal comma, but a trailing space before the outer delimiter), which is exactly what the implementation returns. The test instead expects '"hello", "world"' — a space after the internal comma and no trailing space — which would only result from a *different* input string (one with a space inserted after the 10th character and none at the 21st). The test's input and its expected output are mutually inconsistent, i.e. the assertion encodes a transcription/construction error rather than a legitimate alternate reading of the spec.
- evidence: `Test: assert.deepEqual(parseCsvLine('\"\"\"hello\"\",\"\"world\"\"\" ,a'), ['\"hello\", \"world\"', 'a']); — decoding the input literally gives '\"hello\",\"world\" ' (per the spec's own escaping invariant "Two double quotes inside a quoted field decode to one literal double quote"), not the asserted '\"hello\", \"world\"'.`
- lesson: When constructing quote-escaping test fixtures, mechanically re-derive the expected output from the literal input using the spec's own escaping rule instead of hand-writing a 'looks right' expected string, to avoid input/output mismatches.

<details><summary>verifier output</summary>

```
(verifier output not available)
```
</details>

### Disagreement 3: quoted field containing commas and quotes

- classification: **test-hallucination**
- rationale: The spec's invariants define a strict character-level rule set (toggle quoting on an unescaped double quote, collapse only doubled double-quotes to one literal quote, split only on unquoted commas) and all four given examples are consistent with a straightforward state-machine implementation of those rules. Applying those exact invariants to the disputed test's input (`"a,b,\"c,d\"",e`, i.e. the raw characters `"a,b,"c,d"",e`) yields `['a,b,c', 'd', 'e']`, which is exactly what the implementation produces, because the single (non-doubled) quotes at positions 5 and 9 toggle the quoting state rather than being treated as literal characters. The test instead expects `['a,b,"c,d"', 'e']`, which requires treating an unescaped, unpaired double quote inside an already-quoted field as literal data rather than a state toggle — a rule the spec never states and that even contradicts the explicit 'two quotes decode to one' escaping rule (a lone quote is not a doubled quote). This is an invented escaping behavior for a malformed/non-canonical quoted-field encoding, not something the spec supports.
- evidence: `Spec invariant: "Two double quotes inside a quoted field decode to one literal double quote" (implying only paired quotes decode to literal, otherwise a quote toggles quoting) vs. test: "assert.deepEqual(parseCsvLine('\"a,b,\\\"c,d\\\"\",e'), ['a,b,\"c,d\"', 'e']);" which requires an unpaired embedded quote to be preserved literally without closing the quoted field.`
- lesson: When writing tests for a spec that defines parsing via explicit character-level invariants, only assert outputs that follow mechanically from those invariants applied to well-formed inputs; do not invent expected results for malformed or ambiguous escape sequences not covered by the invariants or examples.

<details><summary>verifier output</summary>

```
(verifier output not available)
```
</details>

### Disagreement 4: mixed quoted and unquoted fields

- classification: **spec-gap**
- rationale: The spec's invariants only define behavior for fields that are entirely wrapped in double quotes ("A field wrapped in double quotes has the surrounding quotes removed", "Two double quotes inside a quoted field decode to one literal double quote"). It never states what should happen when a quote character appears in the middle of a field that does not start with a quote (e.g. the third field 'another""""field""""' in the failing test, which begins with the letter 'a', not a quote). Both the test's expectation (collapsing all embedded quote-pairs to a single literal quote, dropping the trailing pair) and the implementation's toggle-based algorithm (which produces a different quote count/placement, e.g. leaving a trailing literal quote) are plausible extrapolations of the escaping rule to a case the spec never actually describes -- non-quoted fields containing embedded quote runs. Since neither behavior is derivable from the stated invariants or examples, this is a gap rather than a clear violation of the spec (code-bug) or an invention with no textual basis at all (test-hallucination would require the test to assert something the spec clearly forbids or never touches on in any related invariant, but here the test is at least attempting to extend an existing invariant to an untested shape).
- evidence: `Invariants state only: "A field wrapped in double quotes has the surrounding quotes removed" and "Two double quotes inside a quoted field decode to one literal double quote" -- both qualified by 'quoted field' (i.e., a field wrapped in quotes), with no rule for quotes embedded inside a field that is not wrapped in quotes, as in the test's third field 'another\"\"\"\"field\"\"\"\"'.`
- lesson: When writing tests for quote/escape handling, restrict assertions to cases explicitly covered by the spec's examples and invariants (e.g., fields fully wrapped in quotes); for inputs mixing quotes into non-quoted fields, flag the case as spec-gap and request clarification rather than asserting a specific literal output.
- suggested spec edit: Add an invariant specifying how double quotes are handled when they appear inside a field that does not begin immediately with a quote character (e.g., whether such quotes toggle quoted-mode mid-field, collapse in pairs, or are treated as literal characters).

<details><summary>verifier output</summary>

```
(verifier output not available)
```
</details>

## Run run-20260726-063529-e35019

No disagreements — all verifier checks passed.

## Run run-20260727-012742-774a1b

No disagreements — all verifier checks passed.

## Credibility gate

- **candidate** — test-hallucination: observed in 1 run(s), 1 spec(s), helpful=1 harmful=1 wilsonLower=0.09 — The spec's invariants only define simple, unambiguous quoting behavior (single quoted field, doubled quotes decode to one literal quote) and its examples cover only these simple cases. The implementation applies these invariants via the standard, consistent state-machine algorithm: a quote is either an opening/closing delimiter or, if doubled, an escaped literal quote; a lone quote not followed by another quote closes the quoted section and any subsequent quote reopens quoting. Applying this consistently to the disputed input '""""a"""" ,x' (i.e. """"a"""" ,x) yields ['"a" ', 'x'], which is what the code produces. The test instead expects ['""a""', 'x'], a value that cannot be derived by any consistent application of the stated invariants (it implies a different quote-pairing count on each side of 'a' and silently drops the trailing space with no stated rule for that). This is an edge case involving multiple consecutive quote runs at field boundaries that the spec never specifies, and the test's chosen expectation is an invented, internally inconsistent behavior rather than a defensible reading of the invariants. (`lyo-lessons/lesson-1-test-hallucination.md`)
- **candidate** — spec-gap: observed in 1 run(s), 1 spec(s), helpful=1 harmful=1 wilsonLower=0.09 — The spec's invariants only define behavior for fields that are entirely wrapped in double quotes ("A field wrapped in double quotes has the surrounding quotes removed", "Two double quotes inside a quoted field decode to one literal double quote"). It never states what should happen when a quote character appears in the middle of a field that does not start with a quote (e.g. the third field 'another""""field""""' in the failing test, which begins with the letter 'a', not a quote). Both the test's expectation (collapsing all embedded quote-pairs to a single literal quote, dropping the trailing pair) and the implementation's toggle-based algorithm (which produces a different quote count/placement, e.g. leaving a trailing literal quote) are plausible extrapolations of the escaping rule to a case the spec never actually describes -- non-quoted fields containing embedded quote runs. Since neither behavior is derivable from the stated invariants or examples, this is a gap rather than a clear violation of the spec (code-bug) or an invention with no textual basis at all (test-hallucination would require the test to assert something the spec clearly forbids or never touches on in any related invariant, but here the test is at least attempting to extend an existing invariant to an untested shape). (`lyo-lessons/lesson-2-spec-gap.md`)
