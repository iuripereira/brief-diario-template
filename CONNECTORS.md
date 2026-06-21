# CONNECTORS.md — conectores e como estendê-los

O template tem três tipos de conector: **e-mail de entrega** (SMTP), **fontes via MCP**
(calendário/e-mail/tarefas) e **canal de chat** (Slack/Discord/Telegram). Esta página
cobre os suportados e como adicionar novos.

## E-mail de entrega (SMTP)

`scripts/send-email.sh` é SMTP-agnóstico. Defina no `.env`:

| Provedor | `SMTP_URL` | Observações |
| --- | --- | --- |
| Gmail | `smtps://smtp.gmail.com:465` | `SMTP_PASS` = App Password (exige 2FA). |
| Outlook/M365 | `smtps://smtp.office365.com:587` | Pode exigir SMTP AUTH habilitado. |
| Fastmail | `smtps://smtp.fastmail.com:465` | Use uma App Password. |
| Domínio próprio | `smtps://mail.seudominio.com:465` | Conforme seu provedor. |

`SMTP_USER` costuma ser o e-mail remetente; `EMAIL_FROM` aceita `Nome <addr>`.
Teste sem enviar: `MAIL_METHOD=stdout scripts/send-email.sh $(date +%F) | head -40`.

## Fontes via MCP (calendário, e-mail, tarefas)

O `mcp-servers.json` (copiado de `mcp-servers.example.json`) é o `--mcp-config` literal
passado ao `claude -p`: define **quais servidores MCP sobem**. O `config.yaml →
conectores` apenas liga/desliga a seção e dá o nome legível. Para usar uma fonte:

1. Adicione/edite o servidor no `mcp-servers.json`.
2. Ligue o conector correspondente no `config.yaml` (`conectores.<x>.mcp: "<nome>"`).
3. Autorize o servidor (a maioria tem um subcomando `auth` — ver [SETUP.md](SETUP.md)).
4. Rode `scripts/doctor.sh` e depois um `generate.sh` de teste.

**Suportados de fábrica** (já validados no projeto original):

| Fonte | Servidor MCP | Auth |
| --- | --- | --- |
| Tarefas | `@doist/todoist-mcp` | token de API (`TODOIST_API_KEY`) |
| E-mail | `@gongrzhe/server-gmail-autoauth-mcp` | OAuth Google (subcomando `auth`) |
| Calendário | `@cocal/google-calendar-mcp` | OAuth Google (subcomando `auth`) |

**Trocar por um alternativo** (ex.: outro gerenciador de tarefas): substitua o bloco do
servidor no `mcp-servers.json` pelo MCP equivalente e atualize `conectores.tarefas.mcp`.
O `WORKFLOW.md` referencia as fontes de forma genérica ("o MCP de tarefas que você
configurou") e instrui o Claude a **usar o equivalente mais próximo** dos nomes de tool —
então a troca normalmente não exige editar a spec.

## Canal de chat

`scripts/send-chat.sh` escolhe o adaptador por `entrega.chat.tipo`:

| Tipo | Como obter o segredo |
| --- | --- |
| `slack` | Incoming Webhook do Slack → `SLACK_WEBHOOK_URL`. |
| `discord` | Editar canal → Integrações → Webhooks → Novo Webhook → copiar URL → `DISCORD_WEBHOOK_URL`. |
| `telegram` | Crie um bot com o @BotFather → `TELEGRAM_BOT_TOKEN`; descubra o `TELEGRAM_CHAT_ID` (ver abaixo). |
| `none` | Desliga o chat (no-op). |

**Descobrir o `TELEGRAM_CHAT_ID`:** envie uma mensagem ao seu bot e rode
`curl "https://api.telegram.org/bot<TOKEN>/getUpdates"` — o `chat.id` aparece no JSON.

## Adicionar um canal de chat novo

Edite o `case "$TIPO"` em `scripts/send-chat.sh` com um novo ramo que monte o `payload`
e a `url` do seu serviço; adicione o teste de payload em `scripts/test_send_chat.sh`;
documente o segredo aqui e no `.env.example`.
