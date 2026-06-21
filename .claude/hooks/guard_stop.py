#!/usr/bin/env python3
"""Hook Stop — valida o contrato de artefatos ANTES do Claude encerrar o run.

Espelha, dentro do próprio Claude, o passo validate() do workflow: o brief só está
"pronto" se os TRÊS artefatos do dia existem e o HTML termina em </html>. Falhar cedo
(dentro do run) é melhor que falhar depois no passo validate() do GitHub Actions.

ESCOPO: só atua quando a env BRIEF_GENERATION está setada (exportada pelo generate.sh);
em sessões interativas é no-op.

Contrato do hook: para FORÇAR o Claude a continuar (não encerrar), sai com código 2 e
escreve o motivo no stderr. Honra `stop_hook_active` para nunca entrar em loop.

Valida o trio do *.md mais recente em briefs/ (o que acabou de ser gerado), evitando
qualquer cálculo de data/timezone aqui.
"""
import sys
import os
import glob
import json


def main() -> None:
    if not os.environ.get("BRIEF_GENERATION"):
        sys.exit(0)

    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    # Evita loop: se já estamos num ciclo disparado por este mesmo hook, libera.
    if data.get("stop_hook_active"):
        sys.exit(0)

    root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
    briefs_dir = os.path.join(root, "briefs")

    mds = [m for m in glob.glob(os.path.join(briefs_dir, "*.md")) if not m.endswith(".chat.md")]
    problems = []

    if not mds:
        problems.append("nenhum briefs/*.md gerado")
    else:
        newest = max(mds, key=os.path.getmtime)
        stem = os.path.basename(newest)[:-3]  # remove ".md"
        html = os.path.join(briefs_dir, f"{stem}.html")
        chat = os.path.join(briefs_dir, f"{stem}.chat.md")

        if not os.path.isfile(html):
            problems.append(f"falta {stem}.html")
        if not os.path.isfile(chat):
            problems.append(f"falta {stem}.chat.md")

        if os.path.isfile(html):
            try:
                with open(html, encoding="utf-8") as f:
                    tail = f.read().rstrip()[-16:].lower()
                if not tail.endswith("</html>"):
                    problems.append(f"{stem}.html não termina com </html>")
            except Exception as e:
                problems.append(f"erro lendo {stem}.html: {e}")

    if problems:
        print(
            "[hook validação] contrato de artefatos incompleto — não encerre ainda, "
            "grave/corrija e finalize com BRIEF_OK: " + "; ".join(problems),
            file=sys.stderr,
        )
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
