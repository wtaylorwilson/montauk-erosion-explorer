#!/usr/bin/env python3
"""Serve Montauk Erosion Explorer and sibling research catalogs.

    python3 serve.py
    python3 serve.py 8080
    python3 -m http.server 8080   # app only; no /research alias
"""
from __future__ import annotations

import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.abspath(os.path.join(ROOT, "..", "montauk-erosion", "research"))
IMAGERY = os.path.abspath(os.path.join(ROOT, "..", "montauk-erosion", "imagery"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path: str) -> str:
        raw = unquote(path.split("?", 1)[0])
        aliases = (("/research/", RESEARCH), ("/catalog-imagery/", IMAGERY))
        for prefix, base in aliases:
            if raw.startswith(prefix):
                rel = raw[len(prefix):]
                candidate = os.path.normpath(os.path.join(base, rel))
                if candidate.startswith(base + os.sep) or candidate == base:
                    return candidate
        return super().translate_path(path)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("Montauk Erosion Explorer")
    print(f"  open:     http://127.0.0.1:{port}/")
    print(f"  folder:   {ROOT}")
    print(f"  research: {RESEARCH} {'OK' if os.path.isdir(RESEARCH) else 'missing'}")
    print("  stop:     Ctrl+C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
