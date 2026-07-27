function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function ensureNumber(cfg, path, { min = null, max = null } = {}, errors) {
  const parts = path.split(".");
  let cur = cfg;
  for (const p of parts) {
    if (!isObject(cur) || !(p in cur)) return;
    cur = cur[p];
  }
  if (typeof cur !== "number" || !Number.isFinite(cur)) {
    errors.push(`${path} must be a finite number`);
    return;
  }
  if (min != null && cur < min) errors.push(`${path} must be >= ${min}`);
  if (max != null && cur > max) errors.push(`${path} must be <= ${max}`);
}

function ensureBoolean(cfg, path, errors) {
  const parts = path.split(".");
  let cur = cfg;
  for (const p of parts) {
    if (!isObject(cur) || !(p in cur)) return;
    cur = cur[p];
  }
  if (typeof cur !== "boolean") {
    errors.push(`${path} must be a boolean`);
  }
}
function ensureString(cfg, path, errors) {
  const parts = path.split(".");
  let cur = cfg;
  for (const p of parts) {
    if (!isObject(cur) || !(p in cur)) return;
    cur = cur[p];
  }
  if (typeof cur !== "string") {
    errors.push(`${path} must be a string`);
  }
}

export function validateConfig(cfg) {
  const errors = [];
  if (!isObject(cfg)) errors.push("Config must be an object");

  if (!cfg?.timezone || typeof cfg.timezone !== "string") {
    errors.push("timezone must be a string");
  }

  ensureNumber(cfg, "heartbeatTimeoutMs", { min: 1000 }, errors);
  ensureNumber(cfg, "statusRefreshMs", { min: 1000 }, errors);
  ensureNumber(cfg, "updateListsMs", { min: 1000 }, errors);
  ensureNumber(cfg, "connectStaggerMs", { min: 0 }, errors);
  ensureNumber(cfg, "dedupeTtlMs", { min: 100 }, errors);
  ensureNumber(cfg, "dedupeKeepMs", { min: 1000 }, errors);
  ensureNumber(cfg, "dedupeCleanupEveryMs", { min: 1000 }, errors);
  ensureNumber(cfg, "flushEveryMs", { min: 100 }, errors);
  ensureNumber(cfg, "flushMaxLines", { min: 1 }, errors);
  ensureNumber(cfg, "viewersLogMinIntervalMs", { min: 1000 }, errors);
  ensureNumber(cfg, "tiktok.webTimeoutMs", { min: 1000 }, errors);
  ensureBoolean(cfg, "tiktok.enableExtendedGiftInfo", errors);
  ensureNumber(cfg, "tiktok.wsTimeoutMs", { min: 1000 }, errors);
  ensureString(cfg, "tiktok.ttTargetIdc", errors);
  ensureNumber(cfg, "logRotation.maxFileBytes", { min: 0 }, errors);
  ensureNumber(cfg, "logRotation.maxBackups", { min: 0, max: 20 }, errors);
  ensureBoolean(cfg, "autoPauseOnCircuitOpen.enabled", errors);
  ensureBoolean(cfg, "autoPauseOnCircuitOpen.autoResume", errors);
  ensureNumber(cfg, "autoPauseOnCircuitOpen.autoResumeMs", { min: 0 }, errors);

  if (cfg?.alerts && !Array.isArray(cfg.alerts.keywords)) {
    errors.push("alerts.keywords must be an array");
  }
  if (cfg?.alerts?.gifts) {
    ensureBoolean(cfg, "alerts.gifts.enabled", errors);
    ensureNumber(cfg, "alerts.gifts.minRepeatCount", { min: 0 }, errors);
    ensureNumber(cfg, "alerts.gifts.minCoins", { min: 0 }, errors);
    if (cfg.alerts.gifts.names && !Array.isArray(cfg.alerts.gifts.names)) {
      errors.push("alerts.gifts.names must be an array");
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

