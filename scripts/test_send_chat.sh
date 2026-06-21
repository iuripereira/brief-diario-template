#!/usr/bin/env bash
# Testa a montagem de payload por canal sem fazer rede (CHAT_DRYRUN=1).
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
fail=0
check() { if eval "$2"; then echo "ok: $1"; else echo "FALHOU: $1"; fail=1; fi; }

# none → no-op
out=$(CHAT_DRYRUN=1 CHAT_TIPO=none ./send-chat.sh --text "oi" 2>&1 || true)
check "none = no-op" '[[ "$out" == *"pulando"* || -z "$out" ]]'

# slack payload tem {"text"
out=$(CHAT_DRYRUN=1 CHAT_TIPO=slack SLACK_WEBHOOK_URL=x ./send-chat.sh --text "oi" 2>&1)
check "slack payload" 'echo "$out" | grep -q "\"text\""'

# discord payload tem {"content"
out=$(CHAT_DRYRUN=1 CHAT_TIPO=discord DISCORD_WEBHOOK_URL=x ./send-chat.sh --text "oi" 2>&1)
check "discord payload" 'echo "$out" | grep -q "\"content\""'

# telegram payload tem chat_id
out=$(CHAT_DRYRUN=1 CHAT_TIPO=telegram TELEGRAM_BOT_TOKEN=t TELEGRAM_CHAT_ID=c ./send-chat.sh --text "oi" 2>&1)
check "telegram payload" 'echo "$out" | grep -q "chat_id"'

exit $fail
