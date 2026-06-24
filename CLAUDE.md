# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Documentação e código deste repositório são em **português (PT-BR)**. Mantenha esse padrão.

## O que é

Template para um **brief matinal** diário entregue por e-mail (HTML) e chat (Slack/Discord/Telegram). Serverless: um **Cloudflare Worker** dispara um workflow do **GitHub Actions** que roda o Claude Code headless (`claude -p`) para gerar 3 artefatos e os entrega via scripts bash.

## A regra de ouro: GERAÇÃO ≠ ENTREGA

O Claude **só gera arquivos** (`briefs/*.{md,html,chat.md}`); **nunca** envia e-mail nem posta no chat. Toda entrega é dos scripts bash (`send-email.sh`, `send-chat.sh`). Isso é estrutural, não convenção — preserve ao editar:

- [.claude/settings.json](.claude/settings.json) — allow/deny de tools MCP (leitura sim, escrita/envio não) e registra os hooks.
- [.claude/hooks/guard_pretooluse.py](.claude/hooks/guard_pretooluse.py) — bloqueia Bash de rede (`curl`, `smtp`, `api.github.com`…) e escrita fora de `briefs/`.
- [.claude/hooks/guard_stop.py](.claude/hooks/guard_stop.py) — impede o run de encerrar sem o trio de artefatos válido (HTML termina em `</html>`).
- Ambos os hooks **só atuam quando a env `BRIEF_GENERATION=1`** está setada (exportada por `generate.sh`). Em sessão interativa são no-op. Se você trabalha na geração, lembre que essa guarda existe.

## Comandos

```bash
# Setup / validação (cross-platform, só precisa de Node ≥ 20)
npm install
npm run setup            # wizard interativo → gera config.yaml + .env
npm run doctor           # valida config.yaml + .env (rode até dar tudo ✓)

# Testes
npm test                                          # testes do wizard + doctor (node --test)
node --test scripts/setup/env-writer.test.js      # um arquivo de teste só
python3 -m pytest scripts/lib/                     # testa config.py + brief_contract.py (pytest)
bash scripts/test_send_chat.sh                    # testa montagem de payload do chat (sem rede)

# Pipeline local (Linux/macOS/WSL — os scripts são bash; precisam jq, curl, python3+PyYAML, claude CLI)
scripts/generate.sh $(date +%F)                          # gera os 3 artefatos
scripts/generate.sh --check                              # = npm run doctor
MAIL_METHOD=stdout scripts/send-email.sh $(date +%F)     # inspeciona o MIME sem enviar
CHAT_DRYRUN=1 scripts/send-chat.sh $(date +%F)           # imprime o payload sem postar
scripts/send-email.sh $(date +%F)                        # envia de verdade
scripts/send-chat.sh  $(date +%F)                        # posta no chat
```

Não há build nem lint.

## Arquitetura do pipeline

Fluxo ponta a ponta (detalhes nos comentários de cada arquivo):

1. **Disparo** — [scheduler/src/worker.js](scheduler/src/worker.js) (Cloudflare Worker, runtime workerd/V8 — **não** Node). Roda em **dois ticks/dia** ([scheduler/wrangler.toml](scheduler/wrangler.toml) crons, em UTC). Faz **verifica-e-re-dispara**: consulta a API de runs do GitHub e só faz `workflow_dispatch` se ainda não houver run bom de hoje (sucesso/em andamento) — o 2º tick é a rede de recuperação, sem duplicar. Guarda de dia útil via `getUTCDay()` (cuidado com timezone). Usa-se gatilho externo porque o evento `schedule` nativo do Actions atrasa horas.
2. **Orquestração** — [.github/workflows/brief.yml](.github/workflows/brief.yml). Só `workflow_dispatch` (sem `schedule`). `concurrency` serializa runs. Restaura `config.yaml` e credenciais MCP a partir de secrets, gera com **1 retry + validate()**, entrega, e em `failure()` manda alerta duplo (e-mail + chat). `permissions: contents: read` apenas.
3. **Geração** — [scripts/generate.sh](scripts/generate.sh). Monta o prompt (perfil renderizado + data), exporta `BRIEF_GENERATION=1` e chama `claude -p` com `--setting-sources project` (ativa os hooks), `--permission-mode acceptEdits`, modelo configurável. Exige o marcador `BRIEF_OK` na saída.
4. **Conteúdo** — [WORKFLOW.md](WORKFLOW.md) é a **spec do prompt** que o Claude headless executa (seções, fontes MCP, resiliência, e o contrato dos 3 artefatos na §9). O `{{PERFIL}}` é substituído pelo bloco que `config.py render-profile` injeta.
5. **Entrega** — [scripts/send-email.sh](scripts/send-email.sh) (multipart/alternative: `.md`=texto, `.html`=HTML; `MAIL_METHOD` = smtp/sendmail/stdout) e [scripts/send-chat.sh](scripts/send-chat.sh) (Slack/Discord/Telegram via `entrega.chat.tipo`). Ambos têm modo `--alert` para o passo de falha.

## Configuração

- **`config.yaml`** (gitignored; template em [config.example.yaml](config.example.yaml)) — perfil, lente de relevância, fontes de notícia, liga/desliga de seções, conectores. Lido por [scripts/lib/config.py](scripts/lib/config.py) (`get <caminho.pontilhado>` e `render-profile`). Em produção vem do secret `CONFIG_YAML`.
- **`.env`** (gitignored, chmod 600) — segredos (token Claude, SMTP, webhooks). Em produção, os mesmos viram GitHub Secrets.
- **`mcp-servers.json`** (gitignored; template em `mcp-servers.example.json`) — wiring real dos MCPs de calendário/e-mail/tarefas. `conectores` no config é só *intenção*; o `mcp` vazio desliga a seção.

## Wizard de setup ([scripts/setup/](scripts/setup/))

ES modules, Node ≥ 20, `@clack/prompts`. Arquitetura: funções **puras** testáveis separadas da I/O — [config-writer.js](scripts/setup/config-writer.js) e [env-writer.js](scripts/setup/env-writer.js) renderizam strings a partir de um objeto `answers`; [prompts.js](scripts/setup/prompts.js) coleta o `answers`; [index.js](scripts/setup/index.js) orquestra (checagens → coleta → escrita atômica → doctor); [doctor.js](scripts/setup/doctor.js) valida. Cada writer tem `*.test.js` ao lado (TDD). Ao mudar o schema do `answers`, atualize ambos os writers, prompts.js e os testes juntos.

## Convenções

### Documentação do repositório

- **Referência:** [CONFIG.md](CONFIG.md) (campos do config), [SETUP.md](SETUP.md) (credenciais/MCPs/secrets/deploy do Worker), [CONNECTORS.md](CONNECTORS.md) (trocar/estender provedores). Mantenha-os coerentes ao mudar comportamento correspondente.
- **Contrato de artefatos:** fonte canônica única em [scripts/lib/brief_contract.py](scripts/lib/brief_contract.py) (regras verificáveis: os 3 arquivos existem, HTML termina em `</html>`, contêm a data, `.md` > 500 bytes). Tanto o `validate()` em brief.yml quanto guard_stop.py delegam a ele. WORKFLOW.md §9 descreve a *geração* (prosa do prompt) e referencia o validador. Ao mudar as regras, mexa só no `brief_contract.py` (e nos seus testes).
- **Actions pinadas por SHA** no workflow (supply chain); ao atualizar, troque SHA + comentário da versão.

### CHANGELOG

Siga **[Keep a Changelog 1.0.0 (PT-BR)](https://keepachangelog.com/pt-BR/1.0.0/)** em [CHANGELOG.md](CHANGELOG.md):

- Toda mudança relevante ao usuário entra primeiro em `## [Não lançado]`.
- Agrupe por tipo — o CHANGELOG atual usa `Adicionado`, `Mudado`, `Corrigido` (a categoria oficial é "Modificado"; siga a forma já presente no arquivo). Outras categorias do padrão: `Obsoleto`, `Removido`, `Segurança`.
- No release, renomeie `[Não lançado]` para `[X.Y.Z] - AAAA-MM-DD` e abra um novo `[Não lançado]` vazio.

### Versionamento

Siga **[SemVer 2.0.0](https://semver.org/)** (`MAJOR.MINOR.PATCH`):

- **MAJOR** — mudança incompatível (ex.: schema do `config.yaml`/`answers`, contrato de artefatos, variáveis do workflow/Worker).
- **MINOR** — funcionalidade nova retrocompatível.
- **PATCH** — correção retrocompatível.
- A versão canônica vive nas **tags git `vX.Y.Z`**. O `version` do [package.json](package.json) (`private`) **não** é bumpado a cada PR e pode ficar defasado — não é a fonte da verdade.

### Tags e release (PR na `main` = tag)

**Todo PR de código/comportamento mergeado na `main` gera uma tag SemVer `vX.Y.Z`** no commit de merge, com release no GitHub. A `main` permanece sempre lançável. O bump sai dos commits do PR (Conventional Commits → SemVer: `fix:` = PATCH, `feat:` = MINOR, `!`/`BREAKING CHANGE` = MAJOR; o maior vence). **PRs só de documentação não geram tag.**

Não há "release PR" separado nem bump de `package.json`: a tag é gerada direto do merge.

1. **No PR, antes do merge:** no [CHANGELOG.md](CHANGELOG.md) renomeie `## [Não lançado]` → `## [X.Y.Z] - AAAA-MM-DD`, abra um novo `## [Não lançado]` vazio e adicione o link de compare (`vANTERIOR...vX.Y.Z`). Faça isso dentro do PR para o **commit de merge já carregar o cabeçalho da versão** (e não num commit solto depois da tag).
2. **Logo após o merge** (a `main` é protegida; merge só via PR), crie a tag no commit de merge:
   ```bash
   git checkout main && git pull
   git tag -a vX.Y.Z <commit-de-merge> -m "vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --verify-tag --notes "…"   # corpo = a seção [X.Y.Z] do CHANGELOG (release e CHANGELOG iguais)
   ```
3. **Verifique que a tag e o CHANGELOG concordam no commit lançado.** A tag só vale se o
   commit que ela aponta **já carrega** o cabeçalho `## [X.Y.Z]` no
   [CHANGELOG.md](CHANGELOG.md) — senão o release nasce fora de sincronia (foi o que
   aconteceu na `v1.2.1`, taguada antes do carimbo). Confirme logo após o push:
   ```bash
   git show vX.Y.Z:CHANGELOG.md | grep -q "^## \[X.Y.Z\]" \
     && echo "OK: o commit lançado carrega o cabeçalho [X.Y.Z]" \
     || echo "FALHA: re-carimbe o CHANGELOG e re-tague — o commit lançado ainda está em [Não lançado]"
   ```

### Commits e branches

Siga **[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)**:

- Formato: `tipo(escopo): descrição` — ex.: `fix(scheduler): recuperação via Worker (2 ticks)`.
- Tipos comuns no repo: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`. Escopos típicos: `scheduler`, `setup`, `scripts`, `release`.
- Mudança incompatível: `!` após o tipo/escopo (`feat(config)!: ...`) e/ou rodapé `BREAKING CHANGE:`.
- **Branches** seguem o mesmo vocabulário: `tipo/descricao-curta` — ex.: `fix/guard-recuperacao-via-worker`, `feat/setup-wizard`.
