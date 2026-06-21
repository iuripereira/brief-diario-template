# Changelog

Todas as mudanças notáveis deste template serão documentadas neste arquivo.

O formato segue o [Keep a Changelog 1.0.0](https://keepachangelog.com/pt-BR/1.0.0/),
e o projeto adere ao [Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/).

## [1.0.0]

### Adicionado
- **Template genérico do brief diário**, derivado do projeto pessoal `brief-diario`.
- **Configuração única em `config.yaml`** (perfil, lente de relevância, fontes de
  notícia, seções liga/desliga, conectores e entrega), lida por
  [scripts/lib/config.py](scripts/lib/config.py) (`get` + `render-profile`, com testes).
- **`generate.sh`** injeta o bloco de perfil renderizado no prompt; o Claude nunca lê o
  `config.yaml`. Modo `--check` delega ao `doctor.sh`.
- **[WORKFLOW.md](WORKFLOW.md) genérico**, dirigido pelo perfil: agenda/e-mails/tarefas
  referenciam "o MCP que você configurou"; notícias iteram pelas categorias do config;
  seções desligadas são puladas.
- **Conectores plugáveis:** e-mail SMTP genérico ([scripts/send-email.sh](scripts/send-email.sh));
  MCP de tarefas/calendário/e-mail ([mcp-servers.example.json](mcp-servers.example.json));
  entrega em chat Slack/Discord/Telegram ([scripts/send-chat.sh](scripts/send-chat.sh)).
- **`scripts/doctor.sh`** — valida `config.yaml` + `.env` + `mcp-servers.json` e imprime
  o bloco de perfil, sem chamar o Claude nem enviar nada.
- **Guardrails (regra de ouro):** allow/deny em [.claude/settings.json](.claude/settings.json)
  + hooks `PreToolUse`/`Stop` ([.claude/hooks/](.claude/hooks/)), escopados por
  `BRIEF_GENERATION`, validando o trio `.md`/`.html`/`.chat.md`.
- **Orquestração no GitHub Actions** ([.github/workflows/brief.yml](.github/workflows/brief.yml)):
  lock, 1 retry, validação, alerta em falha, retenção; `config.yaml` restaurado de secret.
- **Agendador Cloudflare Worker** ([scheduler/](scheduler/)), parametrizado por
  owner/repo/horário.
- **Documentação:** [README.md](README.md) (passo a passo), [CONFIG.md](CONFIG.md),
  [SETUP.md](SETUP.md), [CONNECTORS.md](CONNECTORS.md).

### Contrato de artefatos
- Três artefatos: `briefs/DATA.md` e `.html` (completos) + `briefs/DATA.chat.md` (enxuto,
  canal-agnóstico — só Agenda, Tarefas e Síntese).

### Validado
- **Teste de ponta a ponta no GitHub Actions real:** geração com fontes reais
  (Gmail/Calendar/Todoist via MCP + WebSearch) e entrega por e-mail (SMTP) e Slack.

### Corrigido
- **Actions atualizadas para Node 24** (`actions/checkout@v5`, `setup-node@v5`,
  `upload-artifact@v5`) — elimina o aviso de depreciação do Node 20.
- **`doctor.sh` aceita segredos via ambiente** (CI/GitHub Actions), não só via arquivo
  `.env`; respeita `MAIL_METHOD` (`stdout`/`sendmail` dispensam `SMTP_*`).
