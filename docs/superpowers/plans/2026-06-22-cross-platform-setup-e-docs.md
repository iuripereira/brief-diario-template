# Cross-platform setup/validação + docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar configurar+validar 100% cross-platform (substituir `doctor.sh` por um `doctor.js` em Node; wizard sem bash) e reescrever a documentação para liderar com `npm run setup` e orientar usuários menos técnicos / Windows.

**Architecture:** Novo `scripts/setup/doctor.js` (Node + dep `yaml`, sem bash/python/jq) com núcleo puro (`parseEnvFile`, `runChecks`) e um runner (`runDoctorCli`). O wizard chama o doctor in-process; `generate.sh --check` chama `node scripts/setup/doctor.js`; o `doctor.sh` é removido. Docs atualizados.

**Tech Stack:** Node ≥ 20 (ESM), pacote `yaml` (já dependência), `node:test`.

## Global Constraints

- Node ≥ 20; ESM; `doctor.js` usa só Node + `yaml` — **sem bash, sem python, sem jq**.
- `doctor.js` **substitui** `doctor.sh` (remover o `.sh`); funciona em Windows/macOS/Linux.
- Produção inalterada (GitHub Actions `brief.yml`, Cloudflare Worker); o CI não usa o doctor.
- Geração/envio locais (`generate.sh`, `send-*.sh`) **não** são portados — continuam bash (Windows via WSL/Git Bash).
- `WORKFLOW.md` fica **inalterado**.
- Não editar specs/plans históricos em `docs/superpowers/` da task anterior.
- `npm test` permanece escopado a `scripts/setup/*.test.js`.
- Paridade fiel com as checagens do `doctor.sh` (perfil, notícias, e-mail por `MAIL_METHOD`, chat por `tipo`, wiring MCP; `.env` OU ambiente).

---

### Task 1: `doctor.js` — núcleo puro + runner (TDD)

**Files:**
- Create: `scripts/setup/doctor.js`
- Test: `scripts/setup/doctor.test.js`

**Interfaces:**
- Consumes: pacote `yaml` (só no runner); forma do `config.yaml`/`.env`/`mcp-servers.json`.
- Produces:
  - `parseEnvFile(text: string): object` — parser `KEY=VALUE` (ignora `#`/vazias, remove aspas externas).
  - `runChecks({config, env, mcpServers}): { checks: {ok:boolean,label:string}[], fail:boolean }` — **puro**, sem I/O.
  - `runDoctorCli(): number` — lê os arquivos do cwd, imprime ✓/✗, devolve 0/1 (NÃO chama `process.exit`).

- [ ] **Step 1: Escrever o teste que falha**

Arquivo `scripts/setup/doctor.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvFile, runChecks } from "./doctor.js";

const baseConfig = {
  perfil: { nome: "Maria", timezone: "America/Sao_Paulo" },
  secoes: { noticias: false },
  entrega: { email: { enabled: false }, chat: { tipo: "none" } },
  conectores: { calendario: { mcp: "" }, email_leitura: { mcp: "" }, tarefas: { mcp: "" } },
};

test("caminho feliz mínimo → sem pendências", () => {
  assert.equal(runChecks({ config: baseConfig, env: {}, mcpServers: null }).fail, false);
});

test("perfil.nome vazio → fail", () => {
  const config = { ...baseConfig, perfil: { nome: "", timezone: "America/Sao_Paulo" } };
  const { fail, checks } = runChecks({ config, env: {}, mcpServers: null });
  assert.equal(fail, true);
  assert.ok(checks.some((c) => !c.ok && c.label.includes("perfil.nome")));
});

test("noticias ligada sem categorias → fail", () => {
  const config = { ...baseConfig, secoes: { noticias: true }, noticias: { categorias: [] } };
  assert.equal(runChecks({ config, env: {}, mcpServers: null }).fail, true);
});

test("email smtp sem SMTP_PASS → fail", () => {
  const config = { ...baseConfig, entrega: { email: { enabled: true }, chat: { tipo: "none" } } };
  const env = { EMAIL_TO: "a@b.c", EMAIL_FROM: "a@b.c", SMTP_URL: "x", SMTP_USER: "u" };
  const { fail, checks } = runChecks({ config, env, mcpServers: null });
  assert.equal(fail, true);
  assert.ok(checks.some((c) => !c.ok && c.label.includes("SMTP")));
});

test("email MAIL_METHOD=stdout não exige SMTP_*", () => {
  const config = { ...baseConfig, entrega: { email: { enabled: true }, chat: { tipo: "none" } } };
  const env = { EMAIL_TO: "a@b.c", EMAIL_FROM: "a@b.c", MAIL_METHOD: "stdout" };
  assert.equal(runChecks({ config, env, mcpServers: null }).fail, false);
});

test("chat=slack sem webhook → fail", () => {
  const config = { ...baseConfig, entrega: { email: { enabled: false }, chat: { tipo: "slack" } } };
  assert.equal(runChecks({ config, env: {}, mcpServers: null }).fail, true);
});

test("chat=telegram sem CHAT_ID → fail", () => {
  const config = { ...baseConfig, entrega: { email: { enabled: false }, chat: { tipo: "telegram" } } };
  assert.equal(runChecks({ config, env: { TELEGRAM_BOT_TOKEN: "t" }, mcpServers: null }).fail, true);
});

test("conector MCP ligado sem mcp-servers.json → fail", () => {
  const config = { ...baseConfig, conectores: { calendario: { mcp: "google-calendar" }, email_leitura: { mcp: "" }, tarefas: { mcp: "" } } };
  const { fail, checks } = runChecks({ config, env: {}, mcpServers: null });
  assert.equal(fail, true);
  assert.ok(checks.some((c) => !c.ok && c.label.includes("mcp-servers.json")));
});

test("conector MCP ligado com mcp-servers.json válido → ok", () => {
  const config = { ...baseConfig, conectores: { calendario: { mcp: "google-calendar" }, email_leitura: { mcp: "" }, tarefas: { mcp: "" } } };
  assert.equal(runChecks({ config, env: {}, mcpServers: { mcpServers: {} } }).fail, false);
});

test("parseEnvFile: KEY=VALUE, comentários, aspas, linhas inválidas", () => {
  const env = parseEnvFile('# comentário\n\nSMTP_USER=user@x.com\nEMAIL_FROM="Brief <a@b.c>"\nBAD LINE\n');
  assert.equal(env.SMTP_USER, "user@x.com");
  assert.equal(env.EMAIL_FROM, "Brief <a@b.c>");
  assert.equal("BAD LINE" in env, false);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test scripts/setup/doctor.test.js`
Expected: FAIL — `Cannot find module './doctor.js'`.

- [ ] **Step 3: Implementar `doctor.js`**

Arquivo `scripts/setup/doctor.js`:
```js
#!/usr/bin/env node
// Valida config.yaml + .env + mcp-servers.json SEM chamar o Claude nem enviar nada.
// Cross-platform (Node + yaml); substitui o antigo scripts/doctor.sh.
// Uso: node scripts/setup/doctor.js  (ou: npm run doctor, ou: generate.sh --check)
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

// Parser .env simples: KEY=VALUE; ignora comentários/linhas vazias; remove aspas externas.
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function dig(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split(".")) {
    if (cur == null || typeof cur !== "object" || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

const has = (env, k) => typeof env[k] === "string" && env[k].length > 0;

// Puro: config (objeto), env (objeto), mcpServers (objeto|null) → { checks, fail }.
export function runChecks({ config, env, mcpServers }) {
  const checks = [];
  const ok = (label) => checks.push({ ok: true, label });
  const bad = (label) => checks.push({ ok: false, label });

  dig(config, "perfil.nome") ? ok("perfil.nome") : bad("perfil.nome vazio");
  dig(config, "perfil.timezone") ? ok("perfil.timezone") : bad("perfil.timezone vazio");
  if (dig(config, "secoes.noticias") === true) {
    const cats = dig(config, "noticias.categorias");
    Array.isArray(cats) && cats.length > 0
      ? ok("noticias.categorias")
      : bad("secoes.noticias=true mas sem categorias");
  }

  if (dig(config, "entrega.email.enabled") === true) {
    has(env, "EMAIL_TO") && has(env, "EMAIL_FROM")
      ? ok("EMAIL_TO/EMAIL_FROM")
      : bad("e-mail ligado mas EMAIL_TO/EMAIL_FROM ausentes");
    const method = env.MAIL_METHOD || "smtp";
    if (method === "smtp") {
      has(env, "SMTP_URL") && has(env, "SMTP_USER") && has(env, "SMTP_PASS")
        ? ok("SMTP_URL/SMTP_USER/SMTP_PASS")
        : bad("MAIL_METHOD=smtp mas SMTP_URL/SMTP_USER/SMTP_PASS incompletos");
    } else if (method === "sendmail" || method === "stdout") {
      ok(`MAIL_METHOD=${method} (não exige SMTP_*)`);
    } else {
      bad(`MAIL_METHOD desconhecido: ${method}`);
    }
  }

  switch (dig(config, "entrega.chat.tipo")) {
    case "slack":
      has(env, "SLACK_WEBHOOK_URL") ? ok("SLACK_WEBHOOK_URL") : bad("chat=slack sem SLACK_WEBHOOK_URL");
      break;
    case "discord":
      has(env, "DISCORD_WEBHOOK_URL") ? ok("DISCORD_WEBHOOK_URL") : bad("chat=discord sem DISCORD_WEBHOOK_URL");
      break;
    case "telegram":
      has(env, "TELEGRAM_BOT_TOKEN") && has(env, "TELEGRAM_CHAT_ID")
        ? ok("TELEGRAM_*")
        : bad("chat=telegram sem TELEGRAM_BOT_TOKEN/CHAT_ID");
      break;
    case "none":
    case "":
    case undefined:
      ok("chat desligado");
      break;
    default:
      bad("entrega.chat.tipo inválido");
  }

  const needMcp = ["calendario", "email_leitura", "tarefas"].some(
    (c) => !!dig(config, `conectores.${c}.mcp`)
  );
  if (needMcp) {
    mcpServers != null
      ? ok("mcp-servers.json válido")
      : bad("conector MCP ligado mas mcp-servers.json ausente/inválido");
  } else {
    ok("nenhum conector MCP ligado");
  }

  return { checks, fail: checks.some((c) => !c.ok) };
}

// Lê os arquivos do cwd, imprime e devolve o exit code (NÃO chama process.exit).
export function runDoctorCli() {
  if (!existsSync("config.yaml")) {
    console.log("== config.yaml ==");
    console.log("  ✗ config.yaml não existe (rode: npm run setup, ou copie de config.example.yaml)");
    return 1;
  }
  const config = parseYaml(readFileSync("config.yaml", "utf-8")) || {};

  let env = { ...process.env };
  if (existsSync(".env")) env = { ...env, ...parseEnvFile(readFileSync(".env", "utf-8")) };

  let mcpServers = null;
  if (existsSync("mcp-servers.json")) {
    try {
      mcpServers = JSON.parse(readFileSync("mcp-servers.json", "utf-8"));
    } catch {
      mcpServers = null;
    }
  }

  const { checks, fail } = runChecks({ config, env, mcpServers });
  for (const c of checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.label}`);

  const ativas = Object.entries(dig(config, "secoes") || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  console.log("\n== perfil ==");
  console.log(`  nome: ${dig(config, "perfil.nome") || "—"}`);
  console.log(`  timezone: ${dig(config, "perfil.timezone") || "—"}`);
  console.log(`  seções ativas: ${ativas.join(", ") || "(nenhuma)"}`);

  console.log("\n" + (fail ? "doctor: há pendências ✗" : "doctor: tudo certo ✓"));
  return fail ? 1 : 0;
}

// Executa só quando chamado diretamente (node scripts/setup/doctor.js).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runDoctorCli());
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test scripts/setup/doctor.test.js`
Expected: PASS — 10 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup/doctor.js scripts/setup/doctor.test.js
git commit -m "feat(setup): doctor.js cross-platform (núcleo puro + runner)"
```

---

### Task 2: Integração — wizard, npm script, generate.sh; remover doctor.sh

**Files:**
- Modify: `scripts/setup/index.js` (trocar a chamada bash pelo doctor in-process)
- Modify: `package.json` (script `doctor`)
- Modify: `scripts/generate.sh:7`
- Delete: `scripts/doctor.sh`

**Interfaces:**
- Consumes: `runDoctorCli()` de `./doctor.js` (Task 1).
- Produces: `npm run doctor`; wizard 100% nativo; `generate.sh --check` via Node.

- [ ] **Step 1: Adicionar o script `doctor` ao `package.json`**

Em `package.json`, no bloco `"scripts"`, deixar assim:
```json
  "scripts": {
    "setup": "node scripts/setup/index.js",
    "doctor": "node scripts/setup/doctor.js",
    "test": "node --test scripts/setup/*.test.js"
  },
```

- [ ] **Step 2: Religar o `index.js` ao doctor in-process**

Em `scripts/setup/index.js`: remover a importação `import { spawnSync } from "node:child_process";` e adicionar `import { runDoctorCli } from "./doctor.js";` junto aos outros imports locais.

Trocar o bloco:
```js
const doctor = spawnSync("bash", ["scripts/doctor.sh"], { stdio: "inherit" });
```
por:
```js
const doctorCode = runDoctorCli();
```
E na última linha trocar `doctor.status === 0` por `doctorCode === 0`:
```js
outro(doctorCode === 0 ? "Pronto ✓" : "Gerado — resolva as pendências do doctor acima.");
```

- [ ] **Step 3: Apontar `generate.sh --check` para o doctor em Node**

Em `scripts/generate.sh`, linha 7, trocar:
```bash
if [[ "${1:-}" == "--check" ]]; then exec scripts/doctor.sh; fi
```
por:
```bash
if [[ "${1:-}" == "--check" ]]; then exec node scripts/setup/doctor.js; fi
```

- [ ] **Step 4: Remover o `doctor.sh`**

Run: `git rm scripts/doctor.sh`
Expected: arquivo removido do índice.

- [ ] **Step 5: Verificar — testes, sintaxe, doctor rodando, wizard, generate --check**

```bash
node --check scripts/setup/index.js && echo "index syntax OK"
npm test < /dev/null 2>&1 | grep -E "^# (tests|pass|fail)"   # espera 20 tests, 20 pass, 0 fail
# doctor roda cross-platform (usa config.example como config temporário):
cp config.example.yaml config.yaml
node scripts/setup/doctor.js; echo "exit=$?"   # imprime ✓/✗ e o bloco de perfil; exit 1 (sem .env) é esperado
npm run doctor >/dev/null 2>&1; echo "npm run doctor exit=$?"
bash scripts/generate.sh --check >/dev/null 2>&1; echo "generate --check exit=$?"  # mesmo comportamento do doctor
rm -f config.yaml
test ! -f scripts/doctor.sh && echo "doctor.sh removido OK"
```
Expected: `index syntax OK`; `# pass 20`; o `node scripts/setup/doctor.js` imprime as checagens + `== perfil ==` e sai 1 (segredos ausentes); `generate --check exit=1` (idêntico); `doctor.sh removido OK`.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/setup/index.js scripts/generate.sh
git rm scripts/doctor.sh
git commit -m "feat(setup): doctor em Node substitui doctor.sh; wizard nativo + npm run doctor"
```

---

### Task 3: Documentação (README, CONFIG, CONNECTORS, SETUP, scheduler, CHANGELOG)

**Files:**
- Modify: `README.md`, `CONFIG.md`, `CONNECTORS.md`, `SETUP.md`, `scheduler/README.md`, `CHANGELOG.md`

**Interfaces:** nenhuma (documentação). Não tocar `WORKFLOW.md` nem os docs em `docs/superpowers/`.

- [ ] **Step 1: README — substituir a seção `## Pré-requisitos`**

Substituir todo o bloco `## Pré-requisitos` (da linha do título até antes de `## Passo a passo`) por:
```markdown
## Pré-requisitos

Dependem do que você vai fazer:

**1. Configurar e validar — qualquer SO (Windows, macOS, Linux)**
- **Node ≥ 20** — é só o que o wizard (`npm run setup`) e o validador (`npm run doctor`) precisam.

**2. Gerar e enviar o brief localmente** (opcional; é o mesmo que o GitHub Actions roda)
- `bash`, `jq`, `curl`, `python3 + PyYAML` (`pip install pyyaml`) e o **Claude Code** CLI (`claude -p` com `CLAUDE_CODE_OAUTH_TOKEN` de `claude setup-token`).
- Nativo no Linux/macOS. **No Windows, rode via WSL ou Git Bash** (os scripts de geração/envio são bash).

**3. Produção (serverless)**
- Conta **GitHub** (Actions) e conta **Cloudflare** (agendador) — ambiente Linux gerenciado, nada a instalar.
- Credenciais dos conectores que escolher: SMTP (e-mail), MCP de tarefas/calendário/e-mail, webhook do chat.
```

- [ ] **Step 2: README — substituir a seção `## Passo a passo` inteira**

Substituir todo o bloco `## Passo a passo` (do título até antes de `## Artefatos gerados`) por:
```markdown
## Passo a passo

1. **Use este repositório como template** no GitHub (botão *Use this template*) ou clone-o.

2. **Rode o wizard de configuração** — Windows, macOS ou Linux:
   ```bash
   npm install
   npm run setup
   ```
   Ele faz algumas perguntas e gera o `config.yaml` e o `.env` (já com as chaves certas, vazias). Ao final, valida com o doctor.

3. **Preencha os segredos no `.env`** (token do Claude, SMTP, webhook do chat) e valide quando quiser — também cross-platform:
   ```bash
   npm run doctor        # rode até dar tudo ✓
   ```
   Referência de cada campo: [CONFIG.md](CONFIG.md). Segredos por conector: [CONNECTORS.md](CONNECTORS.md).

   <details>
   <summary>Prefere configurar à mão, sem o wizard?</summary>

   ```bash
   cp config.example.yaml config.yaml      # gitignored
   cp .env.example .env                     # no Linux/macOS: chmod 600 .env
   # edite os dois e depois rode: npm run doctor
   ```
   </details>

4. **(Opcional) Conectores MCP** (tarefas/calendário/e-mail), se usar:
   ```bash
   cp mcp-servers.example.json mcp-servers.json
   # deixe só os que usa; autorize cada um uma vez localmente — ver SETUP.md
   ```

5. **(Linux/macOS/WSL) Gere e teste localmente:**
   ```bash
   scripts/generate.sh $(date +%F)      # gera briefs/AAAA-MM-DD.{md,html,chat.md}
   MAIL_METHOD=stdout scripts/send-email.sh $(date +%F) | head -40   # inspeciona o MIME
   scripts/send-email.sh $(date +%F)                                 # envia de verdade
   scripts/send-chat.sh  $(date +%F)                                 # posta no chat
   ```
   > No **Windows**, rode esta etapa dentro do **WSL** ou **Git Bash** (os scripts são bash). Configurar/validar (passos 2–3) não precisa disso.

6. **Coloque em produção** (GitHub Actions + agendador): cadastre os GitHub Secrets, ative o workflow e faça o deploy do Cloudflare Worker — runbook completo em [SETUP.md](SETUP.md).

   > ⚠️ **O workflow vem desabilitado por padrão.** Assim ele não fica falhando antes de você cadastrar os secrets. Depois de configurar tudo, habilite-o em **Actions → brief-diario → Enable workflow** (ou `gh workflow enable brief-diario`).
```

- [ ] **Step 3: README — atualizar a nota final de testes**

Na última linha da seção `## Documentação`, substituir:
```markdown
Não há build, lint nem testes automatizados além dos testes dos scripts (`scripts/lib/test_config.py`, `scripts/test_send_chat.sh`).
```
por:
```markdown
Testes: `npm test` (wizard + validador, cross-platform) e os testes dos scripts bash (`scripts/lib/test_config.py`, `scripts/test_send_chat.sh`). Sem build nem lint.
```

- [ ] **Step 4: CONFIG.md — atualizar o parágrafo de abertura (linhas 3–7)**

Substituir:
```markdown
Copie de `config.example.yaml` e edite. Valide com `scripts/doctor.sh`.
```
por:
```markdown
A forma mais fácil de criar este arquivo é o wizard: `npm run setup` (Windows/macOS/Linux). Ou copie de `config.example.yaml` e edite à mão. Em qualquer caso, valide com `npm run doctor`.
```

- [ ] **Step 5: CONNECTORS.md — atualizar a referência ao doctor (linha 30)**

Substituir:
```markdown
4. Rode `scripts/doctor.sh` e depois um `generate.sh` de teste.
```
por:
```markdown
4. Rode `npm run doctor` (cross-platform) e depois um `generate.sh` de teste (Linux/macOS/WSL).
```

E, logo abaixo do título `# CONNECTORS.md — conectores e como estendê-los` (após o parágrafo introdutório existente), inserir:
```markdown
> **Dica:** o wizard (`npm run setup`) já cria no `.env` as chaves certas (vazias) para os conectores e o canal de entrega que você escolher — você só preenche os valores.
```

- [ ] **Step 6: SETUP.md — atualizar o bloco "Validar localmente" (linhas 60–66)**

Substituir o bloco:
```markdown
### Validar localmente
```bash
cp mcp-servers.example.json mcp-servers.json
sed -i "s#COLOQUE_SEU_TOKEN_TODOIST#SEU_TOKEN#g; s#/home/SEU-USUARIO#$HOME#g" mcp-servers.json
scripts/doctor.sh
scripts/generate.sh $(date +%F)     # confira briefs/ e as seções populadas
```
```
por:
```markdown
### Validar localmente
```bash
cp mcp-servers.example.json mcp-servers.json
sed -i "s#COLOQUE_SEU_TOKEN_TODOIST#SEU_TOKEN#g; s#/home/SEU-USUARIO#$HOME#g" mcp-servers.json
npm run doctor                       # validação cross-platform (Win/mac/Linux)
scripts/generate.sh $(date +%F)      # geração: Linux/macOS/WSL — confira briefs/ e as seções
```
> Os passos de autorização de MCP acima (tar/base64, `npx … auth`, `sed`) são **bash** — no Windows, rode-os no **WSL** ou **Git Bash**. A validação `npm run doctor` roda nativa em qualquer SO.
```

- [ ] **Step 7: scheduler/README.md — nota cross-platform no deploy**

Logo após o título `# scheduler — agendador do brief (Cloudflare Worker)` e o parágrafo introdutório, inserir:
```markdown
> Este agendador é Node (`npx wrangler`) — o deploy roda em **Windows, macOS e Linux**.
```

- [ ] **Step 8: CHANGELOG.md — entrada nova no topo**

Logo abaixo do título principal do `CHANGELOG.md`, inserir uma seção nova:
```markdown
## Não lançado

- **Wizard de setup** (`npm run setup`): gera `config.yaml` e `.env` por perguntas — Windows/macOS/Linux.
- **Validador em Node** (`npm run doctor`): substitui `scripts/doctor.sh`, roda cross-platform (sem bash/python/jq). `generate.sh --check` passa a chamá-lo.
- **Docs cross-platform**: pré-requisitos em camadas e passo a passo liderado pelo wizard; nota de Windows (geração/envio via WSL/Git Bash).
```

- [ ] **Step 9: Verificar que não restou referência viva a `doctor.sh`**

Run: `grep -rn "doctor.sh" --include="*.md" --include="*.sh" --include="*.json" --include="*.yml" . | grep -v node_modules | grep -v docs/superpowers`
Expected: **sem saída** (as únicas menções restantes ficam nos specs/plans históricos e no CHANGELOG como descrição da substituição).

- [ ] **Step 10: Commit**

```bash
git add README.md CONFIG.md CONNECTORS.md SETUP.md scheduler/README.md CHANGELOG.md
git commit -m "docs: liderar com npm run setup + pré-requisitos cross-platform"
```

---

## Self-Review

- **Spec coverage:** doctor.js núcleo+runner → Task 1; substituição/integração/remoção do .sh + npm script + generate.sh + index.js → Task 2; README 3 camadas + passo-a-passo liderado pelo wizard + Windows, CONFIG/CONNECTORS/SETUP/scheduler/CHANGELOG → Task 3; WORKFLOW.md inalterado (não há task) ✓; geração/envio não portados ✓.
- **Placeholders:** nenhum; todo código e todo texto de doc presentes.
- **Type consistency:** `parseEnvFile`/`runChecks`/`runDoctorCli` usados na Task 2 batem com a Task 1; `runChecks` recebe sempre `{config, env, mcpServers}`; `index.js` usa `runDoctorCli()` (número), coerente com a remoção de `spawnSync`.
- **Contagem de testes:** 10 (existentes) + 10 (doctor) = 20 — refletido no Step 5 da Task 2.
