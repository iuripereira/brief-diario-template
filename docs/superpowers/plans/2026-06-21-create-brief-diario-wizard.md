# create-brief-diario (wizard interativo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um wizard interativo (`npm run setup`) que gera `config.yaml` preenchido e `.env` (chaves condicionais, valores vazios) a partir de perguntas, validando no fim com `scripts/doctor.sh`.

**Architecture:** CLI Node em `scripts/setup/` que roda dentro de um checkout do template. Três unidades isoladas: `prompts.js` (coleta via terminal), `config-writer.js` e `env-writer.js` (funções puras answers→string, testáveis sem TTY); `index.js` orquestra I/O, escrita atômica e a chamada ao doctor. Não copia arquivos do template e não pede/grava segredos.

**Tech Stack:** Node ≥ 20 (ESM), `@clack/prompts` (prompts), `yaml` (serialização segura do config.yaml), `node --test` (testes nativos, sem dep extra).

## Global Constraints

- Node ≥ 20; o repo usa ESM neste pacote (`"type": "module"` na raiz).
- Wizard roda **dentro** do checkout do template; entry point é `npm run setup` (`npx` é caminho futuro, não objetivo aqui).
- **Não copia** arquivos do template; **não pede nem grava segredos** — `.env` sai só com as chaves relevantes e valores vazios.
- Escrita é **atômica no fim**: nada é escrito antes de toda a coleta terminar (cancelar no meio não deixa arquivos parciais).
- Sobrescrita de `config.yaml`/`.env` exige confirmação (default **não**).
- `.env` recebe `chmod 600`.
- Testes co-locados ao lado do código (padrão do repo: `test_config.py` ao lado de `config.py`).

---

### Task 1: Scaffold do pacote + `env-writer` (função pura, TDD)

**Files:**
- Create: `package.json` (raiz)
- Create: `scripts/setup/env-writer.js`
- Test: `scripts/setup/env-writer.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `renderEnv(answers): string` — recebe o objeto `answers` (forma abaixo) e devolve o conteúdo do `.env`. Regras: sempre inclui `CLAUDE_CODE_OAUTH_TOKEN=`; se `answers.entrega.email.enabled` inclui `MAIL_METHOD=smtp`, `SMTP_URL=`, `SMTP_USER=`, `SMTP_PASS=`, `EMAIL_FROM=`, `EMAIL_TO=`; se `answers.conectores.tarefas === "todoist"` inclui `TODOIST_API_TOKEN=`; chat `slack`→`SLACK_WEBHOOK_URL=`, `discord`→`DISCORD_WEBHOOK_URL=`, `telegram`→`TELEGRAM_BOT_TOKEN=`+`TELEGRAM_CHAT_ID=`, `none`→nada. Sempre termina com `\n`.

Forma de `answers` (compartilhada por todas as tasks):
```js
{
  perfil: { nome, cidade, timezone, idioma_saida, bio },           // strings
  lente_de_relevancia: ["..."],                                    // string[]
  noticias: { num_itens, categorias: [{ nome, fontes: ["..."] }] },
  secoes: { agenda, emails, tarefas, noticias, sintese, conteudo_social }, // bool
  conectores: { calendario, email_leitura, tarefas },              // string MCP ou ""
  entrega: { email: { enabled }, chat: { tipo } }                  // tipo: slack|discord|telegram|none
}
```

- [ ] **Step 1: Criar `package.json` na raiz**

```json
{
  "name": "brief-diario-template",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "Template de brief diário — wizard de setup.",
  "bin": { "create-brief-diario": "scripts/setup/index.js" },
  "scripts": {
    "setup": "node scripts/setup/index.js",
    "test": "node --test scripts/setup/"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "@clack/prompts": "^0.7.0",
    "yaml": "^2.5.0"
  }
}
```

- [ ] **Step 2: Instalar dependências**

Run: `npm install`
Expected: cria `node_modules/` e `package-lock.json`; sem erros.

- [ ] **Step 3: Escrever o teste que falha**

Arquivo `scripts/setup/env-writer.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEnv } from "./env-writer.js";

const base = {
  entrega: { email: { enabled: false }, chat: { tipo: "none" } },
  conectores: { calendario: "", email_leitura: "", tarefas: "" },
};

test("sempre inclui CLAUDE_CODE_OAUTH_TOKEN vazio", () => {
  assert.match(renderEnv(base), /^CLAUDE_CODE_OAUTH_TOKEN=$/m);
});

test("email off omite SMTP_*", () => {
  assert.doesNotMatch(renderEnv(base), /SMTP_/);
});

test("email on inclui SMTP_* e EMAIL_*", () => {
  const env = renderEnv({ ...base, entrega: { email: { enabled: true }, chat: { tipo: "none" } } });
  assert.match(env, /^MAIL_METHOD=smtp$/m);
  assert.match(env, /^SMTP_URL=$/m);
  assert.match(env, /^EMAIL_TO=$/m);
});

test("chat=slack inclui só SLACK_WEBHOOK_URL", () => {
  const env = renderEnv({ ...base, entrega: { email: { enabled: false }, chat: { tipo: "slack" } } });
  assert.match(env, /^SLACK_WEBHOOK_URL=$/m);
  assert.doesNotMatch(env, /DISCORD_WEBHOOK_URL/);
  assert.doesNotMatch(env, /TELEGRAM_/);
});

test("chat=telegram inclui BOT_TOKEN e CHAT_ID", () => {
  const env = renderEnv({ ...base, entrega: { email: { enabled: false }, chat: { tipo: "telegram" } } });
  assert.match(env, /^TELEGRAM_BOT_TOKEN=$/m);
  assert.match(env, /^TELEGRAM_CHAT_ID=$/m);
});

test("tarefas != todoist omite TODOIST_API_TOKEN", () => {
  assert.doesNotMatch(renderEnv(base), /TODOIST_API_TOKEN/);
});

test("tarefas == todoist inclui TODOIST_API_TOKEN", () => {
  const env = renderEnv({ ...base, conectores: { calendario: "", email_leitura: "", tarefas: "todoist" } });
  assert.match(env, /^TODOIST_API_TOKEN=$/m);
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `node --test scripts/setup/env-writer.test.js`
Expected: FAIL — `Cannot find module './env-writer.js'`.

- [ ] **Step 5: Implementar `env-writer.js`**

Arquivo `scripts/setup/env-writer.js`:
```js
// Gera o conteúdo do .env com as chaves relevantes (valores vazios).
// Função pura: answers -> string. Não toca em disco.

export function renderEnv(answers) {
  const lines = [
    "# .env — preencha com valores reais (chmod 600, gitignored).",
    "# Em produção use GitHub Secrets. NÃO faça commit deste arquivo.",
    "",
    "# Claude headless",
    "CLAUDE_CODE_OAUTH_TOKEN=",
  ];

  if (answers.entrega.email.enabled) {
    lines.push(
      "",
      "# E-mail (entrega) — SMTP autenticado (ver CONNECTORS.md)",
      "MAIL_METHOD=smtp",
      "SMTP_URL=",
      "SMTP_USER=",
      "SMTP_PASS=",
      "EMAIL_FROM=",
      "EMAIL_TO=",
    );
  }

  if (answers.conectores.tarefas === "todoist") {
    lines.push("", "# Tarefas (MCP) — Todoist", "TODOIST_API_TOKEN=");
  }

  switch (answers.entrega.chat.tipo) {
    case "slack":
      lines.push("", "# Chat — Slack", "SLACK_WEBHOOK_URL=");
      break;
    case "discord":
      lines.push("", "# Chat — Discord", "DISCORD_WEBHOOK_URL=");
      break;
    case "telegram":
      lines.push("", "# Chat — Telegram", "TELEGRAM_BOT_TOKEN=", "TELEGRAM_CHAT_ID=");
      break;
    default:
      break; // none → sem chaves de chat
  }

  return lines.join("\n") + "\n";
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `node --test scripts/setup/env-writer.test.js`
Expected: PASS — todos os testes verdes.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json scripts/setup/env-writer.js scripts/setup/env-writer.test.js
git commit -m "feat(setup): env-writer + scaffold do pacote do wizard"
```

---

### Task 2: `config-writer` (função pura, TDD)

**Files:**
- Create: `scripts/setup/config-writer.js`
- Test: `scripts/setup/config-writer.test.js`

**Interfaces:**
- Consumes: a forma de `answers` (Task 1) e o pacote `yaml`.
- Produces: `renderConfig(answers): string` — devolve o YAML do `config.yaml` espelhando `config.example.yaml`. Estrutura de saída: `perfil` (nome, cidade, timezone, idioma_saida, bio), `lente_de_relevancia` (lista), `noticias` (num_itens, categorias), `secoes` (6 bools), `conectores` (calendario/email_leitura/tarefas como `{ mcp }`), `entrega` (email.enabled, chat.tipo).

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `scripts/setup/config-writer.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { renderConfig } from "./config-writer.js";

const answers = {
  perfil: { nome: "Maria", cidade: "Curitiba", timezone: "America/Sao_Paulo", idioma_saida: "pt-BR", bio: "Engenheira de dados.\nFoco em IA." },
  lente_de_relevancia: ["carreira", "IA"],
  noticias: { num_itens: 3, categorias: [{ nome: "Tecnologia/IA", fontes: ["TechCrunch"] }] },
  secoes: { agenda: true, emails: true, tarefas: true, noticias: true, sintese: true, conteudo_social: false },
  conectores: { calendario: "google-calendar", email_leitura: "gmail", tarefas: "todoist" },
  entrega: { email: { enabled: true }, chat: { tipo: "slack" } },
};

test("YAML parseável com a estrutura esperada", () => {
  const back = parse(renderConfig(answers));
  assert.equal(back.perfil.nome, "Maria");
  assert.equal(back.perfil.timezone, "America/Sao_Paulo");
  assert.deepEqual(back.lente_de_relevancia, ["carreira", "IA"]);
  assert.equal(back.noticias.num_itens, 3);
  assert.equal(back.noticias.categorias[0].nome, "Tecnologia/IA");
  assert.equal(back.conectores.calendario.mcp, "google-calendar");
  assert.equal(back.conectores.tarefas.mcp, "todoist");
  assert.equal(back.entrega.email.enabled, true);
  assert.equal(back.entrega.chat.tipo, "slack");
  assert.equal(back.secoes.conteudo_social, false);
});

test("bio multilinha preservada", () => {
  const back = parse(renderConfig(answers));
  assert.match(back.perfil.bio, /Engenheira de dados\.\nFoco em IA\./);
});

test("conector vazio vira mcp string vazia", () => {
  const a = { ...answers, conectores: { calendario: "", email_leitura: "", tarefas: "" } };
  const back = parse(renderConfig(a));
  assert.equal(back.conectores.calendario.mcp, "");
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test scripts/setup/config-writer.test.js`
Expected: FAIL — `Cannot find module './config-writer.js'`.

- [ ] **Step 3: Implementar `config-writer.js`**

Arquivo `scripts/setup/config-writer.js`:
```js
// Gera o conteúdo do config.yaml. Função pura: answers -> string YAML.
import { stringify } from "yaml";

export function renderConfig(answers) {
  const obj = {
    perfil: {
      nome: answers.perfil.nome,
      cidade: answers.perfil.cidade,
      timezone: answers.perfil.timezone,
      idioma_saida: answers.perfil.idioma_saida,
      bio: answers.perfil.bio,
    },
    lente_de_relevancia: answers.lente_de_relevancia,
    noticias: {
      num_itens: answers.noticias.num_itens,
      categorias: answers.noticias.categorias,
    },
    secoes: {
      agenda: answers.secoes.agenda,
      emails: answers.secoes.emails,
      tarefas: answers.secoes.tarefas,
      noticias: answers.secoes.noticias,
      sintese: answers.secoes.sintese,
      conteudo_social: answers.secoes.conteudo_social,
    },
    conectores: {
      calendario: { mcp: answers.conectores.calendario },
      email_leitura: { mcp: answers.conectores.email_leitura },
      tarefas: { mcp: answers.conectores.tarefas },
    },
    entrega: {
      email: { enabled: answers.entrega.email.enabled },
      chat: { tipo: answers.entrega.chat.tipo },
    },
  };

  const header =
    "# config.yaml — gerado pelo wizard (npm run setup). Edite à vontade.\n" +
    "# SEGREDOS não entram aqui (vão no .env). Referência: CONFIG.md\n";
  return header + stringify(obj);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test scripts/setup/config-writer.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup/config-writer.js scripts/setup/config-writer.test.js
git commit -m "feat(setup): config-writer (answers -> config.yaml)"
```

---

### Task 3: `prompts.js` — coleta interativa (`collectAnswers`)

**Files:**
- Create: `scripts/setup/prompts.js`

**Interfaces:**
- Consumes: `@clack/prompts`.
- Produces: `collectAnswers(): Promise<Answers>` — faz as perguntas e devolve o objeto `answers` na forma da Task 1. Em cancelamento (`Ctrl-C`), chama `cancel()` e encerra o processo sem retornar (garante que `index.js` não escreve nada).

Não tem teste automatizado (depende de TTY). Verificação é smoke manual.

- [ ] **Step 1: Implementar `prompts.js`**

Arquivo `scripts/setup/prompts.js`:
```js
// Coleta interativa das preferências. Só I/O de terminal; sem escrita em disco.
import {
  intro, text, confirm, select, multiselect, isCancel, cancel,
} from "@clack/prompts";

function bail(value) {
  if (isCancel(value)) {
    cancel("Setup cancelado. Nada foi escrito.");
    process.exit(0);
  }
  return value;
}

export async function collectAnswers() {
  intro("brief-diario — wizard de configuração");

  const nome = bail(await text({ message: "Seu nome", placeholder: "Maria Silva" }));
  const cidade = bail(await text({ message: "Sua cidade", placeholder: "Curitiba" }));
  const timezone = bail(await text({ message: "Timezone (IANA)", initialValue: "America/Sao_Paulo" }));
  const idioma_saida = bail(await text({ message: "Idioma do brief", initialValue: "pt-BR" }));
  const bio = bail(await text({ message: "Bio (1–3 linhas; use \\n p/ quebrar)", placeholder: "Profissão, foco atual…" }));

  const lenteRaw = bail(await text({
    message: "Lente de relevância (itens separados por ';')",
    placeholder: "carreira; finanças pessoais; sua área",
  }));
  const lente_de_relevancia = String(lenteRaw).split(";").map((s) => s.trim()).filter(Boolean);

  const secoesSel = bail(await multiselect({
    message: "Quais seções ligar?",
    options: [
      { value: "agenda", label: "Agenda" },
      { value: "emails", label: "E-mails" },
      { value: "tarefas", label: "Tarefas" },
      { value: "noticias", label: "Notícias" },
      { value: "sintese", label: "Síntese" },
      { value: "conteudo_social", label: "Conteúdo p/ redes (opcional)" },
    ],
    initialValues: ["agenda", "emails", "tarefas", "noticias", "sintese"],
    required: false,
  }));
  const has = (k) => secoesSel.includes(k);
  const secoes = {
    agenda: has("agenda"), emails: has("emails"), tarefas: has("tarefas"),
    noticias: has("noticias"), sintese: has("sintese"), conteudo_social: has("conteudo_social"),
  };

  // Notícias
  let noticias = { num_itens: 5, categorias: [] };
  if (secoes.noticias) {
    const n = bail(await text({ message: "Nº de itens de notícias", initialValue: "5" }));
    noticias.num_itens = Number(n) || 5;
    let mais = true;
    while (mais) {
      const cat = bail(await text({ message: "Nome da categoria de notícia", placeholder: "Tecnologia/IA" }));
      const fontesRaw = bail(await text({ message: "Fontes (separadas por ';', opcional)", placeholder: "TechCrunch; Tecnoblog" }));
      const fontes = String(fontesRaw).split(";").map((s) => s.trim()).filter(Boolean);
      noticias.categorias.push({ nome: String(cat).trim(), fontes });
      mais = bail(await confirm({ message: "Adicionar outra categoria?", initialValue: false }));
    }
  }

  // Conectores (só p/ seções pessoais ligadas)
  const pickMcp = async (label, def) =>
    secoes[label === "calendario" ? "agenda" : label === "email_leitura" ? "emails" : "tarefas"]
      ? bail(await text({ message: `MCP para ${label} ("" desliga)`, initialValue: def }))
      : "";
  const conectores = {
    calendario: await pickMcp("calendario", "google-calendar"),
    email_leitura: await pickMcp("email_leitura", "gmail"),
    tarefas: await pickMcp("tarefas", "todoist"),
  };

  // Entrega
  const emailOn = bail(await confirm({ message: "Entregar por e-mail?", initialValue: true }));
  const chatTipo = bail(await select({
    message: "Canal de chat",
    options: [
      { value: "none", label: "Nenhum" },
      { value: "slack", label: "Slack" },
      { value: "discord", label: "Discord" },
      { value: "telegram", label: "Telegram" },
    ],
    initialValue: "none",
  }));

  return {
    perfil: { nome: String(nome), cidade: String(cidade), timezone: String(timezone), idioma_saida: String(idioma_saida), bio: String(bio).replace(/\\n/g, "\n") },
    lente_de_relevancia,
    noticias,
    secoes,
    conectores,
    entrega: { email: { enabled: emailOn }, chat: { tipo: chatTipo } },
  };
}
```

- [ ] **Step 2: Smoke manual — abre e cancela**

Run: `npm run setup` e pressione `Ctrl-C` na primeira pergunta.
Expected: imprime "Setup cancelado. Nada foi escrito." e sai com código 0. (Vai falhar na importação de `index.js` se a Task 4 ainda não existir — neste caso, teste com `node -e "import('./scripts/setup/prompts.js').then(m=>m.collectAnswers())"` e cancele.)

- [ ] **Step 3: Commit**

```bash
git add scripts/setup/prompts.js
git commit -m "feat(setup): coleta interativa (collectAnswers) com @clack/prompts"
```

---

### Task 4: `index.js` — orquestração + nota no README

**Files:**
- Create: `scripts/setup/index.js`
- Modify: `README.md` (seção "Passo a passo")

**Interfaces:**
- Consumes: `collectAnswers` (Task 3), `renderConfig` (Task 2), `renderEnv` (Task 1).
- Produces: executável do wizard (`npm run setup`). Comportamento: checa Node ≥ 20; exige rodar na raiz do template (presença de `config.example.yaml`); confirma sobrescrita de `config.yaml`/`.env` (default não); coleta; escreve os dois arquivos só no fim; `chmod 600` no `.env`; roda `scripts/doctor.sh`; imprime próximos passos.

- [ ] **Step 1: Implementar `index.js`**

Arquivo `scripts/setup/index.js`:
```js
#!/usr/bin/env node
// Orquestra o wizard: checagens → coleta → escrita atômica → doctor.
import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { outro, confirm, isCancel, cancel, note } from "@clack/prompts";
import { collectAnswers } from "./prompts.js";
import { renderConfig } from "./config-writer.js";
import { renderEnv } from "./env-writer.js";

function die(msg) {
  process.stderr.write(`erro: ${msg}\n`);
  process.exit(1);
}

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) die(`Node ≥ 20 necessário (atual: ${process.versions.node}).`);

if (!existsSync("config.example.yaml")) {
  die("rode na raiz do template (config.example.yaml não encontrado).");
}

async function confirmOverwrite() {
  const exists = ["config.yaml", ".env"].filter((f) => existsSync(f));
  if (exists.length === 0) return;
  const ok = await confirm({
    message: `Já existe: ${exists.join(", ")}. Sobrescrever?`,
    initialValue: false,
  });
  if (isCancel(ok) || !ok) {
    cancel("Abortado. Nada foi alterado.");
    process.exit(0);
  }
}

await confirmOverwrite();
const answers = await collectAnswers();

writeFileSync("config.yaml", renderConfig(answers), "utf-8");
writeFileSync(".env", renderEnv(answers), "utf-8");
chmodSync(".env", 0o600);
note("config.yaml e .env gerados (.env com chmod 600).", "Arquivos");

const doctor = spawnSync("bash", ["scripts/doctor.sh"], { stdio: "inherit" });

note(
  [
    "1. Preencha os valores reais em .env (segredos).",
    "2. Em produção: cadastre os mesmos como GitHub Secrets (ver SETUP.md).",
    "3. Detalhes de cada campo: CONFIG.md / CONNECTORS.md.",
  ].join("\n"),
  "Próximos passos",
);

outro(doctor.status === 0 ? "Pronto ✓" : "Gerado — resolva as pendências do doctor acima.");
```

- [ ] **Step 2: Smoke manual — fluxo completo num diretório de teste**

Run:
```bash
cp -r . /tmp/bd-test && cd /tmp/bd-test && rm -f config.yaml .env && npm run setup
```
Preencha as respostas. Expected: cria `config.yaml` e `.env`; roda o doctor; imprime próximos passos. Confira: `ls -l /tmp/bd-test/.env` mostra permissão `-rw-------`.

- [ ] **Step 3: Verificar que o config gerado é válido p/ o pipeline**

Run (no diretório de teste): `python3 scripts/lib/config.py get perfil.nome --file config.yaml`
Expected: imprime o nome digitado (confirma que o YAML gerado é lido pelo pipeline real).

- [ ] **Step 4: Adicionar nota no README**

Em `README.md`, na seção "Passo a passo", logo após o passo 3 ("Configure suas preferências"), inserir:
```markdown
   > **Atalho:** em vez de copiar e editar à mão, rode o wizard:
   > ```bash
   > npm install && npm run setup
   > ```
   > Ele gera `config.yaml` e `.env` (chaves vazias, p/ você preencher) e valida com o doctor.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/setup/index.js README.md
git commit -m "feat(setup): orquestração do wizard (npm run setup) + nota no README"
```

---

## Self-Review

- **Spec coverage:** fronteira (não copia, não pede segredos) → Tasks 1/4 + Global Constraints; `.env` condicional → Task 1; config.yaml espelhando o exemplo → Task 2; perguntas → Task 3; sobrescrita/atômico/chmod/doctor → Task 4; testes puros + integração doctor → Tasks 1/2/4; README → Task 4. Sem lacunas.
- **Placeholders:** nenhum TBD/TODO; todo código está presente.
- **Type consistency:** `renderEnv`/`renderConfig`/`collectAnswers` usam a mesma forma de `answers` declarada na Task 1 e referenciada nas demais; `conectores.tarefas` é string ("todoist"/"") em ambos os writers.
- **Nota de escopo:** o plano adiciona a dependência `yaml` (além de `@clack/prompts`) para serialização segura — divergência consciente do spec, sinalizada ao usuário.
