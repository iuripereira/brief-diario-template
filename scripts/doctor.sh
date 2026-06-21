#!/usr/bin/env bash
# Valida config.yaml + .env + mcp-servers.json SEM chamar o Claude nem enviar nada.
# Uso: scripts/doctor.sh   (ou generate.sh --check)
set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
set -a; [[ -f .env ]] && source ./.env; set +a
fail=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fail=1; }

echo "== config.yaml =="
[[ -f config.yaml ]] || { bad "config.yaml não existe (copie de config.example.yaml)"; echo; exit 1; }
get() { python3 scripts/lib/config.py get "$1" 2>/dev/null; }
[[ -n "$(get perfil.nome)" ]] && ok "perfil.nome" || bad "perfil.nome vazio"
[[ -n "$(get perfil.timezone)" ]] && ok "perfil.timezone" || bad "perfil.timezone vazio"
if [[ "$(get secoes.noticias)" == "true" ]]; then
  cats="$(get noticias.categorias)"
  [[ -n "$cats" && "$cats" != "[]" ]] \
    && ok "noticias.categorias" || bad "secoes.noticias=true mas sem categorias"
fi

echo "== segredos (.env) p/ entrega escolhida =="
[[ -f .env ]] && ok ".env presente" || bad ".env ausente (copie de .env.example)"
if [[ "$(get entrega.email.enabled)" == "true" ]]; then
  [[ -n "${SMTP_USER:-}" && -n "${SMTP_PASS:-}" && -n "${EMAIL_TO:-}" ]] \
    && ok "SMTP_USER/SMTP_PASS/EMAIL_TO" || bad "e-mail ligado mas SMTP_*/EMAIL_TO incompletos"
fi
case "$(get entrega.chat.tipo)" in
  slack)    [[ -n "${SLACK_WEBHOOK_URL:-}" ]] && ok "SLACK_WEBHOOK_URL" || bad "chat=slack sem SLACK_WEBHOOK_URL" ;;
  discord)  [[ -n "${DISCORD_WEBHOOK_URL:-}" ]] && ok "DISCORD_WEBHOOK_URL" || bad "chat=discord sem DISCORD_WEBHOOK_URL" ;;
  telegram) [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]] && ok "TELEGRAM_*" || bad "chat=telegram sem TELEGRAM_BOT_TOKEN/CHAT_ID" ;;
  none|"")  ok "chat desligado" ;;
  *)        bad "entrega.chat.tipo inválido" ;;
esac

echo "== MCP wiring =="
need_mcp=0
for c in calendario email_leitura tarefas; do
  [[ -n "$(get conectores.$c.mcp)" ]] && need_mcp=1
done
if [[ "$need_mcp" == "1" ]]; then
  [[ -f mcp-servers.json ]] && jq . mcp-servers.json >/dev/null 2>&1 \
    && ok "mcp-servers.json válido" || bad "conector MCP ligado mas mcp-servers.json ausente/inválido"
else
  ok "nenhum conector MCP ligado"
fi

echo
echo "== bloco de perfil (vai ao prompt) =="
python3 scripts/lib/config.py render-profile

echo
[[ $fail -eq 0 ]] && echo "doctor: tudo certo ✓" || echo "doctor: há pendências ✗"
exit $fail
