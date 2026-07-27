import fs from "fs";
import path from "path";

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function createBufferedWriter({
  flushEveryMs = 1200,
  flushMaxLines = 40,
  maxFileBytes = 0,
  maxBackups = 3
} = {}) {
  const buffers = new Map();

  function rotateIfNeeded(filePath, incomingBytes = 0) {
    if (!maxFileBytes || maxFileBytes <= 0) return;
    try {
      const st = fs.statSync(filePath);
      const current = st.size || 0;
      if (current + incomingBytes <= maxFileBytes) return;

      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotated = path.join(dir, `${base}.bak.${stamp}`);
      fs.renameSync(filePath, rotated);

      if (maxBackups > 0) {
        const files = fs.readdirSync(dir)
          .filter((f) => f.startsWith(`${base}.bak.`))
          .map((f) => ({
            name: f,
            full: path.join(dir, f),
            mtime: fs.statSync(path.join(dir, f)).mtimeMs
          }))
          .sort((a, b) => b.mtime - a.mtime);
        const toDelete = files.slice(maxBackups);
        for (const f of toDelete) {
          try { fs.unlinkSync(f.full); } catch {}
        }
      }
    } catch {}
  }

  function queue(filePath, line) {
    if (!filePath || !line) return;
    const dir = path.dirname(filePath);
    ensureDir(dir);

    let entry = buffers.get(filePath);
    if (!entry) {
      entry = { lines: [], timer: null };
      buffers.set(filePath, entry);
    }

    entry.lines.push(line);

    if (entry.lines.length >= flushMaxLines) {
      flush(filePath);
      return;
    }

    if (!entry.timer) {
      entry.timer = setTimeout(() => flush(filePath), flushEveryMs);
    }
  }

  function flush(filePath) {
    const entry = buffers.get(filePath);
    if (!entry) return;

    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    if (!entry.lines.length) return;
    const dir = path.dirname(filePath);
    ensureDir(dir);

    const payload = entry.lines.join("");
    entry.lines = [];

    rotateIfNeeded(filePath, Buffer.byteLength(payload, "utf8"));
    fs.appendFile(filePath, payload, (err) => {
      if (err) console.error("âš ï¸ Error writing file:", filePath, err);
    });
  }

  function flushAll() {
    for (const filePath of buffers.keys()) flush(filePath);
  }

  return { queue, flush, flushAll };
}

