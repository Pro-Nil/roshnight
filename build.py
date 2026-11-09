#!/usr/bin/env python3
"""Build Roshnight's single-page game from src/.

    python build.py                 writes index.html, a complete page
    python build.py --fragment OUT  writes the page body used for the Claude artifact
"""
import argparse
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
SCRIPTS = ['selfhost', 'core', 'bot', 'board', 'util', 'sound', 'routes', 'services', 'screens', 'ranks', 'state', 'draw', 'panels', 'input', 'botclient', 'modes', 'match', 'controls', 'backdrop', 'boot']
HEAD = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '<meta name="theme-color" content="#0a0e1c">\n'
    "<style>body{margin:0}</style>\n</head>\n<body>\n"
)


def read(path):
    with open(path, encoding="utf-8", newline="") as handle:
        return handle.read()


def fragment():
    js = "".join(read(SRC / "js" / f"{name}.js") for name in SCRIPTS)
    return read(SRC / "page.html").replace("/*STYLES*/", read(SRC / "styles.css")).replace("/*SCRIPTS*/", js)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fragment", metavar="OUT", help="write only the page body to OUT")
    args = parser.parse_args()
    if args.fragment:
        out, text = args.fragment, fragment()
    else:
        out, text = ROOT / "index.html", HEAD + fragment() + "</body>\n</html>\n"
    with open(out, "w", encoding="utf-8", newline="") as handle:
        handle.write(text)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
