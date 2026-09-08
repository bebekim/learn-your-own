# First controlled learning experiment: benefit not demonstrated

The learned guidance did not produce a successful suite in this experiment.
No condition passed the fixed valid-reference and mutation panel. This is a
failed product acceptance result, not proof of useful learning or of causal harm.

| Condition | Selection successes | Frozen test successes | Total provider tokens |
| --- | ---: | ---: | ---: |
| No guidance (B0) | 0/6 | 0/2 | 14,169 |
| Static guidance (B1) | 0/6 | 0/2 | 14,887 |
| Learned guidance (B4) | 0/6 | 0/2 | 15,802 |

The same configured model (`openai/gpt-4o-mini`), temperature, budget and verifier
panel were used within each pair. Order rotated across conditions. The learned
negative-zero correction came from two historical SemVer runs; its text was
frozen before the calls. Those training runs used different writers, so this
experiment also requires the advice to transfer across models. The task variants
share one specification and differ only in requested numeric cases. They do not
establish cross-family transfer or an effective sample size of eight independent
problem families.

The current model failed prerequisites that the historical lesson did not
address. Against the ordinary valid reference, 19 suites had an undefined
`describe`, two used a nonexistent `expect` function, one had a syntax error,
and two failed assertions. None passed that reference, before the signed-zero
alternative or mutation requirements could establish test quality. The next
experiment needs a working test-authoring baseline and learning from these
actual failures. It must keep fresh evaluation cases and measure any additional
reflection cost. Adding a general explanation graph would not resolve these
observed failures by itself.

The revised run cost **$0.0196176 and 44,858 tokens**. The first run cost
**$0.0196344 and 44,886 tokens** but was invalidated by a fenced-output extraction
bug; [its records and status](../learning-loop-2026-09-08/measurement-status.md)
are retained. Total new model cost was **$0.039252 and 89,744 tokens**. Historical
training usage is absent, so total lifecycle cost remains unknown. There was no
new model-based judge or reflection call; extraction used an existing mechanical
rule. Verifier subprocesses consume wall time but no model tokens.

The original secondary metric mistakenly allowed a suite that failed the valid
reference to receive mutant-detection credit. A post-run correction now requires
valid-reference success first. This changes the nominal gate from rejection on
unequal diagnostic failures to **inconclusive**, with all primary success counts
unchanged. Neither version supports promotion. No model calls, source outputs,
task assignments or primary outcomes were changed to make the correction.

Evidence:

- [Frozen registration](registration.json), [historical learning evidence](learning.json), and [raw episode rows](episodes.json).
- [Original report](report.md) and [corrected derived report](corrected-report.md).
- [Recompute the correction](recompute-report.mjs); run with Node.js 24+ from this checkout.
- `instrument.ts.snapshot` matches the registered verifier hash. Each episode directory contains the exact prompt, extracted suite, raw response, provider usage and verifier output.

The implementation work closes evidence-integrity failures and provides a
scoped session observation loop. The broader PRD's five artifact types,
explanation-graph inference, automatic causal credit from ordinary sessions,
and demonstrated improvement remain unfinished product goals.
