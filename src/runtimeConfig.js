import fs from "fs";

function deepMerge(base, extra) {
  if (!extra || typeof extra !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = deepMerge(out[k] || {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function applyEnvSecrets(rawConfig = {}) {
  const cfg = deepMerge({}, rawConfig);
  cfg.tiktok = cfg.tiktok || {};

  if (process.env.TIKTOK_SESSIONID) {
    cfg.tiktok.sessionid = process.env.TIKTOK_SESSIONID;
  }
  if (process.env.TIKTOK_SIGN_API_KEY) {
    cfg.tiktok.signApiKey = process.env.TIKTOK_SIGN_API_KEY;
  }
  if (process.env.TIKTOK_TT_TARGET_IDC) {
    cfg.tiktok.ttTargetIdc = process.env.TIKTOK_TT_TARGET_IDC;
  }

  return cfg;
}

export function loadConfigFromFile(configPath) {
  const text = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(text);
  return applyEnvSecrets(parsed);
}

export function createRuntimeConfig({
  configPath = "config.json",
  pollMs = 5000,
  onReload
} = {}) {
  let current = loadConfigFromFile(configPath);
  let lastMtimeMs = 0;
  let timer = null;

  function get() {
    return current;
  }

  function maybeReload() {
    let st;
    try {
      st = fs.statSync(configPath);
    } catch {
      return;
    }

    if (!st?.mtimeMs) return;
    if (st.mtimeMs <= lastMtimeMs) return;

    const prev = current;
    const next = loadConfigFromFile(configPath);
    current = next;
    lastMtimeMs = st.mtimeMs;

    if (typeof onReload === "function") {
      onReload(next, prev);
    }
  }

  function start() {
    try {
      const st = fs.statSync(configPath);
      lastMtimeMs = st?.mtimeMs || 0;
    } catch {
      lastMtimeMs = 0;
    }

    stop();
    timer = setInterval(maybeReload, Math.max(1000, pollMs));
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return {
    get,
    start,
    stop,
    reloadNow: maybeReload
  };
}

