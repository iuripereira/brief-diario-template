#!/usr/bin/env python3
"""Hook Stop — valida o contrato de artefatos ANTES do Claude encerrar o run.

Espelha, dentro do próprio Claude, a validação do workflow usando a MESMA fonte
canônica: scripts/lib/brief_contract.py (também chamado pelo passo validate() do
GitHub Actions). Falhar cedo (dentro do run) é melhor que falhar depois no CI.

ESCOPO: só atua quando a env BRIEF_GENERATION está setada (exportada pelo generate.sh);
em sessões interativas é no-op.

Contrato do hook: para FORÇAR o Claude a continuar (não encerrar), sai com código 2 e
escreve o motivo no stderr. Honra `stop_hook_active` para nunca entrar em loop.

Descobre a data pelo nome do *.md mais recente em briefs/ (o que acabou de ser gerado),
evitando qualquer cálculo de data/timezone aqui, e delega o resto ao validador canônico.
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

    # Importa o validador canônico (mesmas regras do CI). Sem PyYAML — só stdlib.
    sys.path.insert(0, os.path.join(root, "scripts", "lib"))
    try:
        from brief_contract import validate
    except Exception:
        # Nunca derruba o run por falha de import do próprio hook.
        sys.exit(0)

    mds = [m for m in glob.glob(os.path.join(briefs_dir, "*.md")) if not m.endswith(".chat.md")]
    if not mds:
        problems = ["nenhum briefs/*.md gerado"]
    else:
        newest = max(mds, key=os.path.getmtime)
        stem = os.path.basename(newest)[:-3]  # remove ".md" → a data
        problems = validate(stem, briefs_dir)

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
