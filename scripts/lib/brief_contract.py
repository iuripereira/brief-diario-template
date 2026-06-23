#!/usr/bin/env python3
"""Contrato de artefatos do brief — a ÚNICA fonte da verdade do que torna um brief
"pronto". Reutilizado pelo CI (validate() em .github/workflows/brief.yml) e pelo hook
Stop (.claude/hooks/guard_stop.py), para que as regras nunca dupliquem nem divirjam.

Stdlib apenas (não importa yaml): roda em qualquer contexto, inclusive dentro do hook.

Uso (CLI):
  brief_contract.py validate <AAAA-MM-DD> [--dir briefs]   # valida; sai 0/1, erros no stderr
  brief_contract.py files    <AAAA-MM-DD> [--dir briefs]   # imprime os 3 caminhos (1/linha)
"""
import argparse
import os
import sys

# Parâmetros canônicos do contrato.
MIN_MD_BYTES = 500
HTML_END = "</html>"


def artifact_paths(date, briefs_dir="briefs"):
    """Os 3 artefatos do dia, na ordem md → html → chat."""
    return {
        "md": os.path.join(briefs_dir, f"{date}.md"),
        "html": os.path.join(briefs_dir, f"{date}.html"),
        "chat": os.path.join(briefs_dir, f"{date}.chat.md"),
    }


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def validate(date, briefs_dir="briefs"):
    """Retorna a lista de problemas (vazia = OK). Regras niveladas pelo rigor do CI:
    os 3 arquivos existem; o MD passa de MIN_MD_BYTES; o HTML termina em </html>; e os
    3 contêm a data no conteúdo."""
    p = artifact_paths(date, briefs_dir)
    problems = []

    # MD: existe, é arquivo, > MIN_MD_BYTES, contém a data.
    md = p["md"]
    if not os.path.isfile(md):
        problems.append(f"{md} ausente")
    elif os.path.getsize(md) <= MIN_MD_BYTES:
        problems.append(f"{md} pequeno demais (<= {MIN_MD_BYTES} bytes)")
    elif date not in _read(md):
        problems.append(f"{md} não contém a data {date}")

    # HTML: existe, não vazio, termina em </html>, contém a data.
    html = p["html"]
    if not os.path.isfile(html) or os.path.getsize(html) == 0:
        problems.append(f"{html} ausente ou vazio")
    else:
        content = _read(html)
        if not content.rstrip().lower().endswith(HTML_END):
            problems.append(f"{html} não termina com {HTML_END}")
        if date not in content:
            problems.append(f"{html} não contém a data {date}")

    # CHAT: existe, não vazio, contém a data.
    chat = p["chat"]
    if not os.path.isfile(chat) or os.path.getsize(chat) == 0:
        problems.append(f"{chat} ausente ou vazio")
    elif date not in _read(chat):
        problems.append(f"{chat} não contém a data {date}")

    return problems


def main(argv=None):
    ap = argparse.ArgumentParser(description="Contrato de artefatos do brief.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("validate", "files"):
        s = sub.add_parser(name)
        s.add_argument("date")
        s.add_argument("--dir", default="briefs")
    args = ap.parse_args(argv)

    if args.cmd == "files":
        for path in artifact_paths(args.date, args.dir).values():
            print(path)
        return 0

    problems = validate(args.date, args.dir)
    if problems:
        for prob in problems:
            print(f"contrato: {prob}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
