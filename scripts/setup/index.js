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
