#!/usr/bin/env node
// Orquestra o wizard: checagens → coleta → escrita atômica → doctor.
import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { outro, confirm, isCancel, cancel, note } from "@clack/prompts";
import { collectAnswers } from "./prompts.js";
import { renderConfig } from "./config-writer.js";
import { renderEnv } from "./env-writer.js";
import { runDoctorCli } from "./doctor.js";

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
    message: `Já existe: ${exists.join(", ")}. O wizard regenera config.yaml e .env (com chaves vazias) — segredos já preenchidos serão perdidos. Sobrescrever?`,
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
// chmod 0600 só faz sentido em POSIX; no Windows os bits são ignorados.
if (process.platform !== "win32") {
  try {
    chmodSync(".env", 0o600);
  } catch {
    /* sistemas de arquivo sem suporte a permissões POSIX — segue */
  }
}
note("config.yaml e .env gerados (.env com chmod 600).", "Arquivos");

const doctorCode = runDoctorCli();

note(
  [
    "1. Preencha os valores reais em .env (segredos).",
    "2. Em produção: cadastre os mesmos como GitHub Secrets (ver SETUP.md).",
    "3. Detalhes de cada campo: CONFIG.md / CONNECTORS.md.",
  ].join("\n"),
  "Próximos passos",
);

outro(doctorCode === 0 ? "Pronto ✓" : "Gerado — resolva as pendências do doctor acima.");
