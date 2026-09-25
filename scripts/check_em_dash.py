"""Fail if an em dash appears in code that produces displayed text, or in the docs."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLACES = ["backend/app", "backend/chain/ambassadors.json", "frontend/src", "frontend/index.html",
          "station", "config.json", "docs", "README.md"]
SKIP = {"docs/ARCHIVES"}
EM_DASH = "—"


def main() -> int:
    found = []
    for place in PLACES:
        path = ROOT / place
        files = [path] if path.is_file() else [p for p in path.rglob("*") if p.is_file()]
        for f in files:
            rel = f.relative_to(ROOT).as_posix()
            if any(rel.startswith(s) for s in SKIP) or f.suffix not in {".py", ".js", ".jsx", ".json", ".html", ".md", ".css"}:
                continue
            for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                if EM_DASH in line:
                    found.append("%s:%d" % (rel, n))
    for f in found:
        print("em dash: %s" % f)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
