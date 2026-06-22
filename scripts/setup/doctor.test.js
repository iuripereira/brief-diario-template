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
