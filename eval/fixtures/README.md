# Eval Fixtures

Feature 1 uses git snapshots rather than copied fixture repos. Each task's
`repo_ref.ref` pins the target code state.

Future fixture repos can live under this directory when a task needs a tiny
self-contained project instead of the full kernel repo.
