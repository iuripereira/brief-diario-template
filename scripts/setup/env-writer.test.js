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
