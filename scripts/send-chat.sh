#!/usr/bin/env bash
# Posta a versão enxuta do brief (briefs/DATA.chat.md) no canal de chat configurado.
# Uso: send-chat.sh AAAA-MM-DD        → posta o brief enxuto do dia
#      send-chat.sh --alert "msg"     → posta alerta (fallback p/ e-mail)
#      send-chat.sh --text "txt"      → posta texto cru (uso interno/teste)
# Canal vem de entrega.chat.tipo (config) ou de CHAT_TIPO (override de teste).
# CHAT_DRYRUN=1 imprime o payload em vez de postar.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
set -a; [[ -f .env ]] && source ./.env; set +a
export TZ="${BRIEF_TZ:-UTC}" LANG="${LANG:-C.UTF-8}"

TIPO="${CHAT_TIPO:-$(python3 scripts/lib/config.py get entrega.chat.tipo 2>/dev/null || echo none)}"
[[ -n "$TIPO" ]] || TIPO=none

md_to_text() {  # Markdown → texto leve (negrito/links/headers)
  sed -E -e 's/^#{1,6} +(.*)$/*\1*/' -e 's/\*\*([^*]+)\*\*/*\1*/g' \
         -e 's/\[([^]]+)\]\(([^)]+)\)/\1 (\2)/g' -e '/^ *-{3,} *$/d' "$1"
}

post() {  # $1 = texto. Posta no canal $TIPO. Respeita CHAT_DRYRUN.
  local text="$1" payload url
  case "$TIPO" in
    slack)
      [[ -n "${SLACK_WEBHOOK_URL:-}" ]] || { echo "send-chat: SLACK_WEBHOOK_URL vazio; pulando"; return 0; }
      payload=$(jq -nc --arg t "$text" '{text:$t}'); url="$SLACK_WEBHOOK_URL" ;;
    discord)
      [[ -n "${DISCORD_WEBHOOK_URL:-}" ]] || { echo "send-chat: DISCORD_WEBHOOK_URL vazio; pulando"; return 0; }
      text="${text:0:1900}"; payload=$(jq -nc --arg t "$text" '{content:$t}'); url="$DISCORD_WEBHOOK_URL" ;;
    telegram)
      [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]] || { echo "send-chat: credenciais Telegram ausentes; pulando"; return 0; }
      payload=$(jq -nc --arg c "$TELEGRAM_CHAT_ID" --arg t "$text" '{chat_id:$c,text:$t}')
      url="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" ;;
    none|"") echo "send-chat: canal 'none'; pulando (ok)"; return 0 ;;
    *) echo "send-chat: tipo desconhecido: $TIPO" >&2; return 1 ;;
  esac
  if [[ -n "${CHAT_DRYRUN:-}" ]]; then echo "$payload"; return 0; fi
  echo "$payload" | curl -fsS -X POST -H 'Content-type: application/json' --data @- "$url" >/dev/null
}

if [[ "${1:-}" == "--text" ]]; then post "${2:?}"; exit $?; fi

if [[ "${1:-}" == "--alert" ]]; then
  MSG="${2:?uso: send-chat.sh --alert \"mensagem\"}"
  if post "ALERTA brief-diario: $MSG"; then exit 0; fi
  if [[ -n "${EMAIL_TO:-}" ]]; then
    SENDMAIL_BIN="${SENDMAIL_BIN:-$(command -v sendmail || echo /usr/sbin/sendmail)}"
    printf 'From: %s\nTo: %s\nSubject: ALERTA brief-diario\n\n%s\n' \
      "${EMAIL_FROM:-brief@localhost}" "$EMAIL_TO" "$MSG" | "$SENDMAIL_BIN" -t -oi && exit 0
  fi
  echo "send-chat: ALERTA NÃO ENTREGUE: $MSG" >&2; exit 1
fi

TODAY="${1:?uso: send-chat.sh AAAA-MM-DD}"
MD="briefs/$TODAY.chat.md"; [[ -s "$MD" ]] || MD="briefs/$TODAY.md"
[[ -s "$MD" ]] || { echo "send-chat: nenhum brief de $TODAY" >&2; exit 1; }

TEXT=$(md_to_text "$MD")
MAX=35000
(( ${#TEXT} > MAX )) && TEXT="${TEXT:0:$MAX}
…(truncado — versão completa no e-mail)"

for attempt in 1 2; do
  if post "$TEXT"; then echo "send-chat: postado em $TIPO (tentativa $attempt)"; exit 0; fi
  [[ $attempt -eq 1 ]] && sleep "${CHAT_RETRY_SLEEP:-10}"
done
echo "send-chat: falha após 2 tentativas" >&2; exit 1
