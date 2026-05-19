# Gap Taxonomy

Common gap types:

- missing goal or stop condition
- expected process skipped
- verification missing or weak
- model overpowered, underpowered, or mismatched
- token/cost overrun
- missing domain fact
- missing fixture or test
- guardrail did not trigger
- tool or environment failure
- one-off task issue

Keep gap statements concrete:

```text
Expected: fixture replay before prompt promotion.
Observed: prompt changed without fixture replay.
Gap: verification process was skipped for vision extraction work.
```
