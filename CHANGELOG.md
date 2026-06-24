# Changelog

Todas as mudanças notáveis deste template serão documentadas neste arquivo.

O formato segue o [Keep a Changelog 1.0.0](https://keepachangelog.com/pt-BR/1.0.0/),
e o projeto adere ao [Semantic Versioning 2.0.0](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- **Verificação tag↔CHANGELOG no release** ([CLAUDE.md](CLAUDE.md)): passo no fluxo de
  release que confirma que o commit apontado pela tag já carrega o cabeçalho `## [X.Y.Z]` —
  fecha o descompasso que deixou a `v1.2.1` taguada sob `[Não lançado]`.

## [1.2.1] - 2026-06-23

### Mudado
- **Contrato de artefatos numa fonte canônica.** As regras que tornam o brief "pronto"
  (os 3 arquivos existem, HTML termina em `</html>`, contêm a data, `.md` com tamanho
  mínimo) estavam duplicadas e já divergentes entre o `validate()` do workflow (bash) e o
  hook Stop (Python). Agora vivem só em
  [scripts/lib/brief_contract.py](scripts/lib/brief_contract.py); o
  [workflow](.github/workflows/brief.yml) e o [hook](.claude/hooks/guard_stop.py) delegam
  a ele (com testes em `scripts/lib/test_brief_contract.py`). O hook passou a checar
  também tamanho e data (nivelado pelo rigor do CI).

## [1.2.0] - 2026-06-23

### Corrigido
- **Job `guard` quebrado no fallback `schedule`** ([#2](https://github.com/iuripereira/brief-diario-template/issues/2)):
  rodava `gh run list` sem `checkout`/`-R`/`GH_REPO`, então `gh` não resolvia o repo e o
  job falhava **todo dia útil** (ruído de "workflow failed") — e o fallback nunca cobria
  de fato a ausência do Worker. O `schedule` ainda entregava o brief matinal tarde demais.

### Mudado
- **Recuperação migrada do Actions para o Worker.** Removidos o trigger `schedule` e o
  job `guard` de [brief.yml](.github/workflows/brief.yml); `permissions` reduzido para só
  `contents: read`. O [Cloudflare Worker](scheduler/) agora roda em **2 ticks/dia** e
  **verifica-e-re-dispara**: consulta os runs de hoje pela API e só dispara se não houver
  sucesso nem run em andamento (dedup que o `guard` deveria fazer, no horário certo e sem
  git). O PAT usa o *read* (já incluso em "Actions: Read and write") para essa verificação.

### Adicionado
- **`send-email.sh --alert "msg"`**: e-mail `text/plain` mínimo de falha, espelhando o
  `--alert` de `send-chat.sh`. O passo `if: failure()` do workflow agora alerta em **dois
  canais** (e-mail + chat) — se o SMTP cair, o chat ainda avisa, e vice-versa.
- **Convenção de tags/release** em [CLAUDE.md](CLAUDE.md): todo PR mergeado na `main` gera
  uma tag SemVer `vX.Y.Z` coerente com o bump (Conventional Commits → SemVer), com o fluxo
  bump → CHANGELOG → merge → tag/release documentado.

## [1.1.0] - 2026-06-22

### Adicionado
- **Wizard de setup** (`npm run setup`): gera `config.yaml` e `.env` por perguntas —
  Windows/macOS/Linux. Núcleo em `scripts/setup/` (`prompts`, `config-writer`,
  `env-writer`), com testes (`npm test`).
- **Validador em Node** (`npm run doctor`, [scripts/setup/doctor.js](scripts/setup/doctor.js)):
  valida `config.yaml` + `.env`/ambiente + `mcp-servers.json` de forma cross-platform
  (sem bash/python/jq).

### Mudado
- **Documentação liderada pelo wizard**: pré-requisitos em camadas (configurar+validar =
  só Node, qualquer SO; gerar+enviar = bash, Windows via WSL/Git Bash; produção = Linux
  gerenciado) e passo a passo começando por `npm run setup`.
- **`generate.sh --check`** passa a chamar `node scripts/setup/doctor.js`.
- **Diagrama de arquitetura** ([docs/arquitetura.svg](docs/arquitetura.svg)): a caixa de
  configuração reflete `npm run setup` + `npm run doctor` (runtime inalterado).

### Removido
- **`scripts/doctor.sh`** — substituído pelo validador em Node (`npm run doctor`),
  funcionalmente equivalente e cross-platform.

## [1.0.0] - 2026-06-21

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

[1.2.1]: https://github.com/iuripereira/brief-diario-template/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/iuripereira/brief-diario-template/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/iuripereira/brief-diario-template/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/iuripereira/brief-diario-template/releases/tag/v1.0.0
