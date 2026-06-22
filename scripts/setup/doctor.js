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
