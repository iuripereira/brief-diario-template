# Design — `create-brief-diario` (wizard interativo de setup)

Data: 2026-06-21

## Objetivo

Reduzir a fricção de onboarding do template. Hoje o usuário copia `config.example.yaml`
para `config.yaml` e edita à mão, idem para `.env`. Este wizard coleta as preferências
por perguntas interativas e gera os dois arquivos já estruturados, terminando com uma
validação via `scripts/doctor.sh`.

## Fronteira (o que NÃO faz)

- **Não copia arquivos do template** (isso fica com "Use this template" do GitHub ou
  `npx degit`). O wizard roda *dentro* de um checkout existente.
- **Não pede nem grava segredos.** Gera `.env` apenas com as **chaves** relevantes
  (conforme conectores/entrega escolhidos) e **valores vazios** para o usuário preencher.
- Não cadastra GitHub Secrets nem configura o Cloudflare Worker (continua manual via
  SETUP.md).

## Decisões fechadas

- Wizard interativo apenas (sem scaffolder de cópia).
- Biblioteca de prompts: **`@clack/prompts`**.
- `.env`: chaves condicionais, valores vazios.
- Localização: **`scripts/setup/`**.
- **`package.json` na raiz** do repo, com a dependência, um script `setup` e o campo `bin`.

## Layout

```
scripts/setup/
  index.js          # orquestra: detecta sobrescrita → prompts → writers → doctor
  prompts.js        # perguntas @clack/prompts → objeto `answers`
  config-writer.js  # answers → string YAML do config.yaml (função pura)
  env-writer.js     # answers → string do .env, chaves condicionais (função pura)
package.json        # raiz: deps (@clack/prompts), script "setup", bin
```

### Responsabilidades (unidades isoladas)

- **`prompts.js`** — só I/O de terminal. Exporta `collectAnswers(): Promise<Answers>`.
  Faz as perguntas e devolve um objeto plano. Nenhuma escrita em disco.
- **`config-writer.js`** — função pura `renderConfig(answers): string`. Dado o objeto
  `answers`, devolve o conteúdo YAML. Sem I/O. Testável diretamente.
- **`env-writer.js`** — função pura `renderEnv(answers): string`. Decide quais chaves
  entram (ver "Regras do .env") e devolve o conteúdo `.env`. Sem I/O.
- **`index.js`** — orquestração e todo o I/O: checagem de Node, detecção/confirmação de
  sobrescrita, chama `collectAnswers`, escreve os arquivos (atômico no fim), `chmod 600`
  no `.env`, executa `doctor.sh` e imprime próximos passos.

### Formato de `Answers`

```js
{
  perfil: { nome, cidade, timezone, idioma_saida, bio },
  lente_de_relevancia: string[],
  noticias: { enabled: bool, num_itens: number,
              categorias: [{ nome, fontes: string[] }] },
  secoes: { agenda, emails, tarefas, noticias, sintese, conteudo_social }, // bools
  conectores: { calendario, email_leitura, tarefas }, // string do MCP ou ""
  entrega: { email: { enabled }, chat: { tipo } } // tipo: slack|discord|telegram|none
}
```

## Fluxo (`index.js`)

1. **Pré-checagem:** Node ≥ 20; senão, mensagem clara e saída ≠ 0.
2. **Sobrescrita:** se `config.yaml` ou `.env` já existem, confirmar (default **não**).
   Recusa → aborta sem escrever nada.
3. **Coleta:** `collectAnswers()` (ver "Perguntas").
4. **Escrita atômica:** só após coletar tudo, gera as strings (`renderConfig`,
   `renderEnv`) e escreve. Garante que `Ctrl-C` no meio não deixa arquivos parciais.
5. **Permissão:** `chmod 600` no `.env`.
6. **Validação:** roda `scripts/doctor.sh`, encaminha a saída ao usuário.
7. **Próximos passos:** instrui preencher valores no `.env`, cadastrar GitHub Secrets e
   apontar para SETUP.md / CONFIG.md.

## Perguntas (espelham `config.example.yaml`)

- **Perfil:** nome; cidade; timezone (default `America/Sao_Paulo`); idioma_saida
  (default `pt-BR`); bio (texto multi-linha, opcional).
- **Lente de relevância:** texto multi-linha → lista (uma linha por item).
- **Notícias:** ligar? Se sim: nº de itens (default 5) e ≥1 categoria
  (nome + fontes opcionais). Loop "adicionar outra categoria?".
- **Seções:** multiselect entre `agenda, emails, tarefas, noticias, sintese,
  conteudo_social` (este último off por padrão).
- **Conectores:** para cada seção pessoal ligada (agenda/emails/tarefas), escolher o MCP
  (defaults: `google-calendar`, `gmail`, `todoist`). Seção desligada → conector `""`.
- **Entrega:** e-mail on/off; chat `tipo` (slack | discord | telegram | none).

## Regras do `.env` (chaves condicionais, valores vazios)

Sempre: `CLAUDE_CODE_OAUTH_TOKEN=`.

- `entrega.email.enabled` → `MAIL_METHOD=smtp`, `SMTP_URL=`, `SMTP_USER=`, `SMTP_PASS=`,
  `EMAIL_FROM=`, `EMAIL_TO=`.
- `conectores.tarefas == "todoist"` → `TODOIST_API_TOKEN=`.
- `entrega.chat.tipo`:
  - `slack` → `SLACK_WEBHOOK_URL=`
  - `discord` → `DISCORD_WEBHOOK_URL=`
  - `telegram` → `TELEGRAM_BOT_TOKEN=`, `TELEGRAM_CHAT_ID=`
  - `none` → nenhuma chave de chat.

(Comentário de cabeçalho replicado do `.env.example`; mesma observação de que o
`GH_DISPATCH_TOKEN` vive no scheduler, não aqui.)

## Tratamento de erro

- Sobrescrita protegida por confirmação (default não).
- Cancelamento do clack / `Ctrl-C` → aborta limpo (nada escrito antes do passo 4).
- Node < 20 → mensagem e saída ≠ 0.
- `doctor.sh` com pendências → o wizard **mesmo assim teve sucesso** (gerou os arquivos);
  apenas reporta as pendências e o usuário resolve preenchendo o `.env`.

## Testes

- **Unidade (puros, sem TTY):**
  - `renderConfig(answers)` → YAML esperado para um conjunto representativo de answers;
    o YAML resultante deve ser parseável por `python3 scripts/lib/config.py get ...`.
  - `renderEnv(answers)` → caso "chat=slack" inclui só `SLACK_WEBHOOK_URL` (e não
    `DISCORD_*`/`TELEGRAM_*`); caso email off omite `SMTP_*`; tarefas≠todoist omite
    `TODOIST_API_TOKEN`.
- **Integração:** gerar config+env de um fixture, rodar `scripts/doctor.sh` e confirmar
  que valida a estrutura (pendências de segredos vazios são esperadas e aceitáveis).

## Documentação

- README: adicionar nota em "Passo a passo" oferecendo `npm run setup` (ou `npx`) como
  atalho ao passo de copiar/editar `config.yaml` e `.env`.
