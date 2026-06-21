#!/usr/bin/env python3
"""Lê o config.yaml do brief e expõe valores + o bloco de perfil p/ o prompt.

Uso:
  config.py get <caminho.pontilhado> [--file config.yaml]
  config.py render-profile [--file config.yaml]
"""
import argparse, json, sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write("config.py: PyYAML não instalado. Rode: pip install pyyaml\n")
    sys.exit(1)


def load(path):
    p = Path(path)
    if not p.is_file():
        sys.stderr.write(f"config.py: config não encontrado em {path}\n")
        sys.exit(1)
    with p.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def dig(data, dotted):
    cur = data
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def emit_scalar(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


def render_profile(cfg):
    perfil = cfg.get("perfil", {}) or {}
    lente = cfg.get("lente_de_relevancia", []) or []
    noticias = cfg.get("noticias", {}) or {}
    secoes = cfg.get("secoes", {}) or {}
    conectores = cfg.get("conectores", {}) or {}

    L = []
    L.append("## PERFIL E PREFERÊNCIAS (injetado pelo orquestrador)")
    L.append("")
    L.append(f"- Nome: {perfil.get('nome', '')}")
    L.append(f"- Cidade: {perfil.get('cidade', '')}")
    L.append(f"- Timezone: {perfil.get('timezone', '')}")
    L.append(f"- Idioma de saída: {perfil.get('idioma_saida', 'pt-BR')}")
    bio = (perfil.get("bio") or "").strip()
    if bio:
        L.append(f"- Bio: {bio}")
    if lente:
        L.append("- Lente de relevância: " + "; ".join(str(x) for x in lente))

    cats = noticias.get("categorias", []) or []
    if cats:
        L.append("")
        L.append(f"### Notícias ({noticias.get('num_itens', 5)} itens)")
        for c in cats:
            nome = c.get("nome", "")
            fontes = ", ".join(c.get("fontes", []) or [])
            L.append(f"- {nome}" + (f" — fontes sugeridas: {fontes}" if fontes else ""))

    nomes = {
        "agenda": "📅 Agenda", "emails": "📧 E-mails", "tarefas": "✅ Tarefas",
        "noticias": "📰 Notícias", "sintese": "🎯 Síntese",
        "conteudo_social": "💼 Conteúdo social",
    }
    ativas = [nomes[k] for k, v in secoes.items() if v and k in nomes]
    L.append("")
    L.append("### Seções ativas")
    L.append(", ".join(ativas) if ativas else "(nenhuma)")

    L.append("")
    L.append("### Conectores configurados")
    for chave, rotulo in [("calendario", "Calendário"), ("email_leitura", "E-mail"),
                          ("tarefas", "Tarefas")]:
        mcp = (conectores.get(chave) or {}).get("mcp", "")
        L.append(f"- {rotulo}: " + (mcp if mcp else "(desligado)"))
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("get"); g.add_argument("path"); g.add_argument("--file", default="config.yaml")
    r = sub.add_parser("render-profile"); r.add_argument("--file", default="config.yaml")
    args = ap.parse_args()

    cfg = load(args.file)
    if args.cmd == "get":
        print(emit_scalar(dig(cfg, args.path)))
    elif args.cmd == "render-profile":
        print(render_profile(cfg))


if __name__ == "__main__":
    main()
