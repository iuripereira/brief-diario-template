#!/usr/bin/env python3
"""Hook PreToolUse — reforça a regra de ouro do projeto: GERAÇÃO ≠ ENTREGA.

Defesa em profundidade ao lado do allow/deny de .claude/settings.json: durante a
geração headless, o Claude NUNCA pode (a) usar o Bash para qualquer ação de
rede/entrega (e-mail, webhook, push) nem (b) gravar fora de briefs/.

ESCOPO: só atua quando a env BRIEF_GENERATION está setada — o generate.sh a exporta
antes de chamar `claude -p`. Em sessões interativas (sem essa env) o hook é no-op,
para não atrapalhar a edição normal do repositório.

Contrato do hook: lê o JSON do evento na stdin. Para BLOQUEAR, sai com código 2 e
escreve o motivo no stderr (o Claude recebe o motivo). Para LIBERAR, sai 0 — e aí o
fluxo normal de permissões (settings.json) continua valendo (não é um bypass).
"""
import sys
import os
import re
import json


def block(msg: str) -> None:
    print(f"[hook geração≠entrega] BLOQUEADO: {msg}", file=sys.stderr)
    sys.exit(2)


def main() -> None:
    # Só faz sentido na geração headless; fora dela, não interfere.
    if not os.environ.get("BRIEF_GENERATION"):
        sys.exit(0)

    try:
        data = json.load(sys.stdin)
    except Exception:
        # Nunca derruba o run por falha de parsing do próprio hook.
        sys.exit(0)

    tool = data.get("tool_name", "")
    tool_input = data.get("tool_input") or {}

    if tool == "Bash":
        cmd = tool_input.get("command") or ""
        # Comandos de rede/entrega/exfiltração que a geração não tem por que rodar
        # (a geração só precisa de `date`/`ls`). A entrega é dos scripts bash externos.
        forbidden = re.compile(
            r"\b(curl|wget|sendmail|ssmtp|msmtp|mutt|mailx|mail|nc|netcat|ncat|"
            r"telnet|ssh|scp|sftp|rsync|nmap|openssl)\b"
            r"|hooks?\.slack\.com|api\.github\.com|\bsmtps?\b",
            re.IGNORECASE,
        )
        if forbidden.search(cmd):
            block(f"comando de rede/entrega não permitido na geração: {cmd[:160]}")

    elif tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        norm = os.path.normpath(path)
        # O Claude só pode escrever os artefatos em briefs/<arquivo> (sem subpastas).
        if not re.search(r"(^|/)briefs/[^/]+$", norm):
            block(f"escrita fora de briefs/ não permitida: {path}")

    sys.exit(0)


if __name__ == "__main__":
    main()
