import fs from "fs";

function parseEnvLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const idx = trimmed.indexOf("=");
  if (idx <= 0) return null;

  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function loadEnvFile(path = ".env") {
  if (!fs.existsSync(path)) return;

  const text = fs.readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    if (process.env[parsed.key] == null || process.env[parsed.key] === "") {
      process.env[parsed.key] = parsed.value;
    }
  }
}

