#!/usr/bin/env python3
"""Render the small Jinja-style templates used by shell workflow scripts.

This intentionally supports only variable interpolation:

    {{ variable_name }}

It keeps mkdir-agentic dependency-free while preserving Jinja-compatible
template files for the scaffolds that should be easy to replace with full
Jinja2 later.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


VARIABLE = re.compile(r"{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}")


def parse_var(raw: str) -> tuple[str, str]:
    if "=" not in raw:
        raise argparse.ArgumentTypeError(f"expected NAME=VALUE, got {raw!r}")
    name, value = raw.split("=", 1)
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        raise argparse.ArgumentTypeError(f"invalid variable name {name!r}")
    return name, value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("template")
    parser.add_argument("output")
    parser.add_argument("--var", action="append", type=parse_var, default=[])
    args = parser.parse_args()

    values = dict(args.var)
    source = Path(args.template).read_text()
    missing: set[str] = set()

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in values:
            missing.add(key)
            return match.group(0)
        return values[key]

    rendered = VARIABLE.sub(replace, source)
    if missing:
        names = ", ".join(sorted(missing))
        print(f"missing template variables: {names}", file=sys.stderr)
        return 2

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
