import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const requirementsPath = path.join(
  repoRoot,
  "services",
  "parser",
  "requirements.txt",
);
const stampPath = path.join(
  repoRoot,
  ".venv",
  ".parser-requirements.sha256",
);

async function main() {
  const requirementsContent = await fsp.readFile(requirementsPath);
  const requirementsHash = crypto
    .createHash("sha256")
    .update(requirementsContent)
    .digest("hex");

  await fsp.mkdir(path.dirname(stampPath), { recursive: true });
  await fsp.writeFile(stampPath, `${requirementsHash}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
