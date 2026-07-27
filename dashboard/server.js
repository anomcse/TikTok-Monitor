import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "256kb" }));

function resolveProjectRoot() {
  const candidates = [
    process.cwd(),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", "..")
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, "config.json")) || fs.existsSync(path.join(c, "streamers.txt"))) {
        return c;
      }
    } catch {}
  }

  return process.cwd();
}

const ROOT = resolveProjectRoot();
const CONFIG_PATH = path.join(ROOT, "config.json");
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");
const STREAMERS_LIST_PATH = path.join(ROOT, "streamers.txt");
const HIGHLIGHT_USERS_LIST_PATH = path.join(ROOT, "highlight_users.txt");

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
    const version = String(pkg?.version || "").trim();
    return version || "unknown";
  } catch {
    return "unknown";
  }
}

function readPlainList(filePath) {
  try {
    const lines = fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    for (const item of lines) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out;
  } catch {
    return [];
  }
}

function readListWithFallback(primaryPath, fallbackName) {
  const primary = readPlainList(primaryPath);
  if (primary.length) return primary;

  const fallbackPath = path.join(process.cwd(), fallbackName);
  if (fallbackPath !== primaryPath) {
    const fallback = readPlainList(fallbackPath);
    if (fallback.length) return fallback;
  }

  return primary;
}

function getActiveStreamersList() {
  return readListWithFallback(STREAMERS_LIST_PATH, "streamers.txt");
}

function parseListPayload(body) {
  const src = body || {};
  const values = [];

  if (Array.isArray(src.items)) {
    values.push(...src.items);
  } else if (typeof src.text === "string") {
    values.push(...src.text.split(/\r?\n/));
  } else {
    return null;
  }

  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const v = String(raw || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function writePlainList(filePath, items) {
  const payload = `${items.join("\n")}${items.length ? "\n" : ""}`;
  fs.writeFileSync(filePath, payload, "utf8");
}

const config = readConfig();
const JSONL_ROOT = path.join(ROOT, config?.paths?.jsonlRoot || "logs_jsonl");
const HIGHLIGHT_ROOT = path.resolve(ROOT, config?.paths?.highlightRoot || "logs_highlight");
const STATUS_PATH = path.join(ROOT, "dashboard", "status.json");
const ADMIN_COMMANDS_FILE = path.join(ROOT, "dashboard", "commands.jsonl");
const ADMIN_TOKEN = process.env.DASHBOARD_ADMIN_TOKEN || "";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5177;
const HOST = process.env.HOST || "0.0.0.0";

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");
function safeNumber(n, fallback = null) {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim() !== "") {
    const parsed = Number(n);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}


function clampNumber(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseDayToDate(dayStr) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dayStr);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

function getTodayDayStr() {
  const tz = config?.timezone || "America/Sao_Paulo";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const dd = parts.find((p) => p.type === "day")?.value || "01";
  const mm = parts.find((p) => p.type === "month")?.value || "01";
  const yyyy = parts.find((p) => p.type === "year")?.value || "1970";
  return `${dd}-${mm}-${yyyy}`;
}

function sortDaysDesc(days) {
  return days
    .map((d) => ({ d, dt: parseDayToDate(d) }))
    .filter((x) => x.dt)
    .sort((a, b) => b.dt - a.dt)
    .map((x) => x.d);
}

async function exists(p) {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(p) {
  try {
    const entries = await fs.promises.readdir(p, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listFiles(p) {
  try {
    const entries = await fs.promises.readdir(p, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function requireAdmin(req, res) {
  if (!ADMIN_TOKEN) return true;
  const got = req.headers["x-admin-token"] || req.query.token;
  if (String(got || "") === String(ADMIN_TOKEN)) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

async function tailLastLines(filePath, maxBytes = 512 * 1024) {
  try {
    const stat = await fs.promises.stat(filePath);
    const size = stat.size;
    const start = Math.max(0, size - maxBytes);

    const fd = await fs.promises.open(filePath, "r");
    const buf = Buffer.alloc(size - start);
    await fd.read(buf, 0, buf.length, start);
    await fd.close();

    const text = buf.toString("utf8");
    return text.split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

function tryParseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizeSnapshot(obj) {
  if (!obj || obj.type !== "snapshot") return null;
  const data = obj.data || {};
  return {
    ts: obj.ts || null,
    highlight: !!obj.highlight,
    streamer: obj.streamer || null,
    roomId: obj.roomId ?? data.roomId ?? null,
    connectedAt: safeNumber(data.connectedAt, null),
    msgsPerMin: safeNumber(data.msgsPerMin, 0),
    viewers: {
      current: safeNumber(data?.viewers?.current, null),
      max: safeNumber(data?.viewers?.max, null),
    },
    topChatters: Array.isArray(data.topChatters) ? data.topChatters : [],
    topGifters: Array.isArray(data.topGifters) ? data.topGifters : [],
    totals: data.totals || {},
  };
}

function getRuntimeStreamersStatus() {
  try {
    const raw = fs.readFileSync(STATUS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.streamers && typeof parsed.streamers === "object" ? parsed.streamers : {};
  } catch {
    return {};
  }
}

function buildEventMessage(type, data) {
  if (!data || typeof data !== "object") return "";

  if (type === "chat") return String(data.comment || data.message || "");
  if (type === "gift") {
    const name = data.giftName || data.gift || "gift";
    const rep = safeNumber(data.repeatCount, 1) ?? 1;
    return `${name} x${rep}`;
  }
  if (type === "follow") return "follow";
  if (type === "share") return "share";
  if (type === "member") return "member";
  if (type === "like") {
    const likeNow = data.likeCount ?? data.count ?? data.likeDelta ?? null;
    if (likeNow !== null) return `likes: ${likeNow}`;
    return "like";
  }
  if (type === "roomUser") {
    const v = data.viewerCount ?? data.viewers ?? null;
    return v === null ? "viewers" : `viewers: ${v}`;
  }
  if (type === "goalUpdate") {
    const goalId = data.goalId ?? "-";
    const progress = data.progress ?? "-";
    const target = data.target ?? "-";
    return `goal ${goalId}: ${progress}/${target}`;
  }
  if (type === "pollMessage") {
    const title = data.pollTitle || data.pollId || "poll";
    const state = data.pollState || "update";
    const voters = data.voters ?? "-";
    return `${state}: ${title} (voters=${voters})`;
  }
  if (type === "linkMicBattle") {
    const battleId = data.battleId || "-";
    const action = data.action || "update";
    const scoreSummary = data.scoreSummary || "-";
    return `battle ${battleId} (${action}) score=${scoreSummary}`;
  }
  if (type === "roomPin") {
    const action = data.action || "pin_update";
    const pinType = data.pinType || "-";
    const preview = data.preview || "-";
    return `${action}/${pinType}: ${preview}`;
  }
  if (type === "quit") {
    const idleMs = Number(data.idleMs ?? 0) || 0;
    const mins = Math.max(1, Math.round(idleMs / 60000));
    const lastType = data.lastEventType ? ` last=${data.lastEventType}` : "";
    return `idle ~${mins}m${lastType}`.trim();
  }
  if (type === "alert") {
    const aType = data.alertType ? String(data.alertType) : "alert";
    const u = data.user && data.user !== "-" ? `@${data.user}` : "";
    const msg = data.message ? String(data.message) : "";
    return `[${aType}] ${u} ${msg}`.replace(/\s+/g, " ").trim();
  }

  if (data.message) return String(data.message);
  if (data.reason) return String(data.reason);
  if (data.details) return String(data.details);
  return "";
}

function normalizeEvent(obj) {
  if (!obj || !obj.type) return null;
  const data = obj.data || {};
  const type = String(obj.type);

  const user = obj.user || data.user || data.uniqueId || data.nickname || null;
  const message = buildEventMessage(type, data);

  return {
    ts: obj.ts || null,
    streamer: obj.streamer || null,
    type,
    user: user ? String(user) : null,
    message: message ? String(message) : "",
    highlight: !!obj.highlight,
    data,
  };
}

function isOnlineBySnapshotTs(snapshotTs, intervalMs = 60_000) {
  if (!snapshotTs) return false;
  const t = new Date(snapshotTs).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= intervalMs * 2;
}
let dayIndex = new Map();
let cachedDays = [];
let lastIndexBuildAt = 0;

async function rebuildIndexIfNeeded(force = false) {
  const now = Date.now();
  if (!force && now - lastIndexBuildAt < 10_000) return;

  lastIndexBuildAt = now;
  dayIndex = new Map();

  if (!(await exists(JSONL_ROOT))) {
    cachedDays = [];
    return;
  }

  const years = await listDirs(JSONL_ROOT);
  for (const year of years) {
    const yearPath = path.join(JSONL_ROOT, year);
    const months = await listDirs(yearPath);
    for (const month of months) {
      const monthPath = path.join(yearPath, month);
      const days = await listDirs(monthPath);
      for (const day of days) {
        const dayPath = path.join(monthPath, day);
        if (!dayIndex.has(day)) dayIndex.set(day, { path: dayPath, year, month });
      }
    }
  }

  cachedDays = sortDaysDesc([...dayIndex.keys()]);
}

async function getDayPath(dayStr) {
  await rebuildIndexIfNeeded();
  return dayIndex.get(dayStr)?.path || null;
}

async function getAvailableDays() {
  await rebuildIndexIfNeeded();
  return cachedDays;
}

async function getStreamersForDay(dayStr) {
  const dayPath = await getDayPath(dayStr);
  if (!dayPath) return [];

  const files = await listFiles(dayPath);
  const names = files
    .filter((f) => f.endsWith(" snapshots.jsonl"))
    .map((f) => f.replace(" snapshots.jsonl", ""));

  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

async function getEventStreamersForDay(dayStr) {
  const files = await getEventFilesForDay(dayStr);
  const names = files.map((f) => f.streamer);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

async function getLatestSnapshotForStreamer(dayStr, streamer) {
  const dayPath = await getDayPath(dayStr);
  if (!dayPath) return null;

  const snapFile = path.join(dayPath, `${streamer} snapshots.jsonl`);
  const lines = await tailLastLines(snapFile, 256 * 1024);
  if (!lines.length) return null;

  for (let i = lines.length - 1; i >= 0; i--) {
    const obj = tryParseJson(lines[i]);
    const snap = normalizeSnapshot(obj);
    if (snap) return snap;
  }
  return null;
}

async function getSeriesForStreamer(dayStr, streamer) {
  const dayPath = await getDayPath(dayStr);
  if (!dayPath) return null;

  const snapFile = path.join(dayPath, `${streamer} snapshots.jsonl`);
  if (!(await exists(snapFile))) {
    const evIndex = await getEventsIndex(dayStr);
    const series = evIndex?.series?.[streamer] || null;
    const last = evIndex?.last?.[streamer] || null;
    if (!series || !series.ts?.length) return null;
    return {
      last,
      series: {
        ts: series.ts,
        msgsPerMin: series.msgsPerMin,
        viewers: series.viewers
      }
    };
  }

  const content = await fs.promises.readFile(snapFile, "utf8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  const ts = [];
  const msgsPerMin = [];
  const viewers = [];
  let lastSnap = null;

  for (const line of lines) {
    const obj = tryParseJson(line);
    const snap = normalizeSnapshot(obj);
    if (!snap) continue;

    lastSnap = snap;
    ts.push(snap.ts);
    msgsPerMin.push(snap.msgsPerMin);
    viewers.push(snap.viewers.current);
  }

  return { last: lastSnap, series: { ts, msgsPerMin, viewers } };
}

const summaryCache = new Map();
const rankingsCache = new Map();
const MAX_DAY_CACHE = 21;

function putBoundedCache(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_DAY_CACHE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

async function getSnapshotFilesForDay(dayStr) {
  const dayPath = await getDayPath(dayStr);
  if (!dayPath) return [];
  const files = await listFiles(dayPath);
  return files
    .filter((f) => f.endsWith(" snapshots.jsonl"))
    .map((f) => path.join(dayPath, f));
}

async function getSnapshotSignature(dayStr) {
  const paths = await getSnapshotFilesForDay(dayStr);
  if (!paths.length) return "none";

  const tokens = [];
  for (const p of paths) {
    try {
      const st = await fs.promises.stat(p);
      tokens.push(`${p}:${st.size}:${Math.trunc(st.mtimeMs)}`);
    } catch {
      tokens.push(`${p}:0:0`);
    }
  }

  return tokens.sort().join("|");
}

function getRuntimeStatusSignature() {
  const rt = getRuntimeStreamersStatus();
  const keys = Object.keys(rt || {}).sort();
  return keys.map((k) => {
    const info = rt[k] || {};
    const conn = info.connection || {};
    return [
      k,
      String(info.status || ""),
      Number(info.onlineSince || 0),
      Number(info.lastAttemptAt || 0),
      conn.connected ? 1 : 0,
      conn.connecting ? 1 : 0,
      Number(conn.circuitOpenUntil || 0)
    ].join(":");
  }).join("|");
}
async function buildSummary(dayStr) {
  const intervalMs = config?.snapshots?.intervalMs ?? 60_000;
  const streamers = await getStreamersForDay(dayStr);
  const eventsIndex = await getEventsIndex(dayStr);
  const includeRuntime = dayStr === getTodayDayStr();
  const runtimeStatus = includeRuntime ? getRuntimeStreamersStatus() : {};
  const activeEventStreamers = Object.entries(eventsIndex?.streamers || {})
    .filter(([, v]) => v?.hasActivity)
    .map(([k]) => k);
  const allStreamers = [...new Set([...(streamers || []), ...(activeEventStreamers || []), ...Object.keys(runtimeStatus || {})])];

  const items = [];
  for (const s of allStreamers) {
    const last = await getLatestSnapshotForStreamer(dayStr, s);
    const rt = runtimeStatus[s] || {};
    const rtConn = rt?.connection || {};
    const runtimeConnected = !!rtConn.connected;
    const runtimeState = String(rt?.status || "").toLowerCase();
    const runtimeOnline = runtimeConnected || runtimeState === "online" || runtimeState === "probing";

    if (!last) {
      const evInfo = eventsIndex?.streamers?.[s] || null;
      if ((!evInfo || !evInfo.hasActivity) && !(includeRuntime && runtimeOnline) && runtimeState !== "paused") continue;
      items.push({
        streamer: s,
        lastTs: evInfo?.lastTs || rt?.lastAttemptAt || rt?.onlineSince || null,
        online: (includeRuntime && runtimeOnline) || (evInfo?.hasActivity && evInfo?.lastTs ? isOnlineBySnapshotTs(evInfo.lastTs, intervalMs) : false),
        liveOpenedAt: safeNumber(rt?.onlineSince, safeNumber(rtConn.connectedAt, null)),
        msgsPerMin: safeNumber(evInfo?.msgsPerMin, 0),
        viewers: { current: evInfo?.viewersCurrent ?? null, max: null },
        topChatters: Array.isArray(evInfo?.topChatters) ? evInfo.topChatters : [],
        topGifters: Array.isArray(evInfo?.topGifters) ? evInfo.topGifters : [],
        totals: { ...(evInfo?.totals || {}) },
        roomId: rtConn.roomId || null,
      });
      continue;
    }

    items.push({
      streamer: s,
      lastTs: last.ts,
      online: (includeRuntime && runtimeOnline) || ((last.connectedAt != null) && isOnlineBySnapshotTs(last.ts, intervalMs)),
      liveOpenedAt: safeNumber(rt?.onlineSince, last.connectedAt ?? safeNumber(rtConn.connectedAt, null)),
      msgsPerMin: last.msgsPerMin,
      viewers: last.viewers,
      topChatters: last.topChatters,
      topGifters: last.topGifters,
      totals: { ...(last.totals || {}) },
      roomId: last.roomId || null,
    });
  }
  items.sort((a, b) => {
    if (!!a.online !== !!b.online) return a.online ? -1 : 1;
    if (a.online && b.online) {
      const aOpen = Number(a.liveOpenedAt || 0);
      const bOpen = Number(b.liveOpenedAt || 0);
      if (aOpen !== bOpen) return aOpen - bOpen;
    }
    return (b.msgsPerMin ?? 0) - (a.msgsPerMin ?? 0);
  });
  return { day: dayStr, streamers: items };
}

async function buildSummaryCached(dayStr) {
  const snapSig = await getSnapshotSignature(dayStr);
  const evSig = await getEventsSignature(dayStr);
  const rtSig = dayStr === getTodayDayStr() ? getRuntimeStatusSignature() : "no-rt";
  const signature = `${snapSig}|${evSig}|${rtSig}`;
  const cached = summaryCache.get(dayStr);
  if (cached && cached.signature === signature) return cached.data;

  const data = await buildSummary(dayStr);
  putBoundedCache(summaryCache, dayStr, { signature, data });
  return data;
}
async function getEventFilesForDay(dayStr) {
  const dayPath = await getDayPath(dayStr);
  if (!dayPath) return [];

  const files = await listFiles(dayPath);
  return files
    .filter((f) => f.endsWith(" events.jsonl"))
    .map((f) => ({
      streamer: f.replace(" events.jsonl", ""),
      path: path.join(dayPath, f),
    }));
}

const dayEventsCache = new Map();

async function getEventsForDay(dayStr) {
  const files = await getEventFilesForDay(dayStr);
  const fileStats = [];
  for (const f of files) {
    try {
      const st = await fs.promises.stat(f.path);
      fileStats.push(`${f.path}:${st.size}:${st.mtimeMs}`);
    } catch {
      fileStats.push(`${f.path}:0:0`);
    }
  }
  const key = fileStats.sort().join("|");

  const cached = dayEventsCache.get(dayStr);
  if (cached && cached.key === key) return cached.events;

  const events = [];
  for (const f of files) {
    let content = "";
    try {
      content = await fs.promises.readFile(f.path, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const obj = tryParseJson(line);
      const ev = normalizeEvent(obj);
      if (!ev) continue;
      events.push({
        ts: ev.ts,
        streamer: ev.streamer,
        type: ev.type,
        user: ev.user,
        message: ev.message,
        highlight: !!ev.highlight,
        data: ev.data
      });
    }
  }

  events.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
  dayEventsCache.set(dayStr, { key, events });
  return events;
}

function floorToMinuteTs(isoTs) {
  const t = new Date(isoTs).getTime();
  if (Number.isNaN(t)) return null;
  const m = Math.floor(t / 60000) * 60000;
  return new Date(m).toISOString();
}

function topNFromMap(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function buildEventsIndex(events, topN = 10) {
  const per = new Map();
  const ACTIVE_TYPES = new Set([
    "chat",
    "gift",
    "member",
    "follow",
    "share",
    "like",
    "roomUser",
    "goalUpdate",
    "pollMessage",
    "linkMicBattle",
    "roomPin"
  ]);

  function ensure(streamer) {
    if (!per.has(streamer)) {
      per.set(streamer, {
        lastTs: null,
        totals: {},
        chatCounts: new Map(),
        giftCounts: new Map(),
        chatBuckets: new Map(),
        viewerBuckets: new Map(),
        hasActivity: false
      });
    }
    return per.get(streamer);
  }

  for (const ev of events) {
    if (!ev?.streamer) continue;
    const s = ev.streamer;
    const entry = ensure(s);
    const ts = ev.ts || null;
    if (ts && (!entry.lastTs || ts > entry.lastTs)) entry.lastTs = ts;

    const type = ev.type || "unknown";
    if (ACTIVE_TYPES.has(type)) entry.hasActivity = true;
    const repeat = Number(ev?.data?.repeatCount ?? 1) || 1;
    const totalAdd = type === "gift" ? repeat : 1;
    entry.totals[type] = (entry.totals[type] || 0) + totalAdd;

    if (type === "chat" && ev.user) {
      entry.chatCounts.set(ev.user, (entry.chatCounts.get(ev.user) || 0) + 1);
    }
    if (type === "gift" && ev.user) {
      entry.giftCounts.set(ev.user, (entry.giftCounts.get(ev.user) || 0) + repeat);
    }

    const minuteKey = ts ? floorToMinuteTs(ts) : null;
    if (minuteKey) {
      if (type === "chat") {
        entry.chatBuckets.set(minuteKey, (entry.chatBuckets.get(minuteKey) || 0) + 1);
      }
      if (type === "roomUser") {
        const v = safeNumber(ev?.data?.viewerCount, null);
        if (v != null) entry.viewerBuckets.set(minuteKey, v);
      }
    }
  }

  const streamers = {};
  const series = {};
  const last = {};

  for (const [streamer, e] of per.entries()) {
    const chatBuckets = [...e.chatBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const viewerBuckets = [...e.viewerBuckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const ts = chatBuckets.map((x) => x[0]);
    const msgsPerMin = chatBuckets.map((x) => x[1]);
    const viewers = ts.map((t) => {
      const v = e.viewerBuckets.get(t);
      return v == null ? null : v;
    });

    // compute recent msgs/min (last 10 minutes of chat activity)
    let mpm = 0;
    if (chatBuckets.length) {
      const lastTs = chatBuckets[chatBuckets.length - 1][0];
      const lastMs = new Date(lastTs).getTime();
      const windowMs = 10 * 60 * 1000;
      let count = 0;
      for (const [k, v] of chatBuckets) {
        const km = new Date(k).getTime();
        if (lastMs - km <= windowMs) count += v;
      }
      mpm = count / 10;
    }

    const topChatters = topNFromMap(e.chatCounts, topN);
    const topGifters = topNFromMap(e.giftCounts, topN);

    streamers[streamer] = {
      lastTs: e.lastTs,
      totals: e.totals,
      msgsPerMin: mpm,
      viewersCurrent: viewerBuckets.length ? viewerBuckets[viewerBuckets.length - 1][1] : null,
      topChatters,
      topGifters,
      hasActivity: !!e.hasActivity
    };

    if (ts.length) {
      series[streamer] = { ts, msgsPerMin, viewers };
      last[streamer] = {
        ts: e.lastTs,
        streamer,
        msgsPerMin: mpm,
        viewers: { current: streamers[streamer].viewersCurrent, max: null },
        topChatters,
        topGifters,
        totals: e.totals
      };
    }
  }

  return { streamers, series, last };
}

const eventsIndexCache = new Map();

async function getEventsIndex(dayStr) {
  const sig = await getEventsSignature(dayStr);
  const cached = eventsIndexCache.get(dayStr);
  if (cached && cached.sig === sig) return cached.data;

  const events = await getEventsForDay(dayStr);
  const topN = config?.snapshots?.topNSnapshot ?? 10;
  const data = buildEventsIndex(events, topN);
  eventsIndexCache.set(dayStr, { sig, data });
  return data;
}

async function getEventsSignature(dayStr) {
  const files = await getEventFilesForDay(dayStr);
  if (!files.length) return "none";

  const tokens = [];
  for (const f of files) {
    try {
      const st = await fs.promises.stat(f.path);
      tokens.push(`${f.path}:${st.size}:${Math.trunc(st.mtimeMs)}`);
    } catch {
      tokens.push(`${f.path}:0:0`);
    }
  }
  return tokens.sort().join("|");
}

const eventTotalsCache = new Map();

async function computeEventTotals(dayStr, { streamer = "all" } = {}) {
  const events = await getEventsForDay(dayStr);
  let joined = 0;
  let quit = 0;
  let firstTs = null;
  let lastTs = null;

  for (const ev of events) {
    if (streamer !== "all" && ev.streamer !== streamer) continue;
    const ts = ev.ts || null;
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }
    if (ev.type === "member") joined += 1;
    if (ev.type === "quit") quit += 1;
  }

  const firstMs = firstTs ? new Date(firstTs).getTime() : NaN;
  const lastMs = lastTs ? new Date(lastTs).getTime() : NaN;
  const elapsedMs =
    Number.isFinite(firstMs) && Number.isFinite(lastMs) && lastMs > firstMs
      ? lastMs - firstMs
      : 0;

  return {
    day: dayStr,
    streamer,
    joined,
    quit,
    firstTs,
    lastTs,
    elapsedMs
  };
}

async function computeEventTotalsCached(dayStr, { streamer = "all" } = {}) {
  const evSig = await getEventsSignature(dayStr);
  const key = `${dayStr}|${streamer}|${evSig}`;
  const cached = eventTotalsCache.get(key);
  if (cached) return cached;
  const data = await computeEventTotals(dayStr, { streamer });
  eventTotalsCache.set(key, data);
  return data;
}

async function computeLikeTotals(dayStr, { streamer = "all", untilTs = "" } = {}) {
  const events = await getEventsForDay(dayStr);
  const byStreamer = new Map();
  const seededByTotal = new Map();
  const fallbackByStreamer = new Map();
  const seen = new Set();
  const untilMs = untilTs ? new Date(untilTs).getTime() : NaN;

  for (const ev of events) {
    if (ev.type !== "like") continue;
    if (!Number.isNaN(untilMs)) {
      const evMs = new Date(ev.ts || 0).getTime();
      if (Number.isNaN(evMs) || evMs > untilMs) continue;
    }
    const evStreamer = String(ev.streamer || "");
    if (!evStreamer) continue;
    if (streamer !== "all" && evStreamer !== streamer) continue;

    const dedupeKey = [
      evStreamer,
      String(ev.ts || ""),
      String(ev.user || ev?.data?.uniqueId || ""),
      String(ev.roomId || ev?.data?.roomId || ""),
      String(ev?.data?.likeDelta ?? ev?.data?.likeCount ?? ev?.data?.totalLikeCount ?? ev?.data?.count ?? "")
    ].join("|");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const totalLikeCount = safeNumber(ev?.data?.totalLikeCount, null);
    const likeDelta = safeNumber(ev?.data?.likeDelta, null);
    const likeCount = safeNumber(ev?.data?.likeCount, null);
    const genericCount = safeNumber(ev?.data?.count, null);
    const increment = Math.max(1, Number(likeDelta ?? likeCount ?? genericCount ?? 1));

    if (Number.isFinite(totalLikeCount) && totalLikeCount > 0) {
      seededByTotal.set(evStreamer, true);
      byStreamer.set(evStreamer, Math.max(byStreamer.get(evStreamer) || 0, totalLikeCount));
      continue;
    }

    if (seededByTotal.get(evStreamer)) {
      byStreamer.set(evStreamer, (byStreamer.get(evStreamer) || 0) + increment);
    } else {
      fallbackByStreamer.set(evStreamer, (fallbackByStreamer.get(evStreamer) || 0) + increment);
    }
  }

  for (const [s, v] of fallbackByStreamer.entries()) {
    if (!seededByTotal.get(s)) byStreamer.set(s, v);
  }

  const entries = [...byStreamer.entries()].map(([s, value]) => ({ streamer: s, value }));
  const total = entries.reduce((acc, it) => acc + Number(it.value || 0), 0);
  return { total, byStreamer: entries };
}

function dedupeAlerts(sortedDesc, windowMs = 5 * 60 * 1000) {
  const out = [];
  const keptByKey = new Map();

  for (const a of sortedDesc) {
    const tsMs = new Date(a.ts || 0).getTime();
    const msg = String(a.message || "");
    const key = `${a.streamer || ""}::${a.type || ""}::${msg}`;

    const prev = keptByKey.get(key);
    if (!prev) {
      keptByKey.set(key, { idx: out.length, tsMs });
      out.push({ ...a, repeats: 0 });
      continue;
    }
    if (!Number.isNaN(tsMs) && !Number.isNaN(prev.tsMs) && (prev.tsMs - tsMs) > windowMs) {
      const key2 = `${key}::block::${tsMs}`;
      keptByKey.set(key2, { idx: out.length, tsMs });
      out.push({ ...a, repeats: 0 });
      continue;
    }
    out[prev.idx].repeats = (out[prev.idx].repeats || 0) + 1;
  }

  return out;
}

async function buildAlerts(dayStr, { streamer = "all", limit = 150, includeSystem = true } = {}) {
  const eventFiles = await getEventFilesForDay(dayStr);

  const allowedTypes = new Set(["alert"]);
  if (includeSystem) {
    ["error", "offline", "streamEnd", "disconnected", "connected"].forEach((t) => allowedTypes.add(t));
  }

  const out = [];
  for (const f of eventFiles) {
    if (streamer !== "all" && f.streamer !== streamer) continue;

    const lines = await tailLastLines(f.path, 512 * 1024);
    for (const line of lines) {
      const obj = tryParseJson(line);
      const ev = normalizeEvent(obj);
      if (!ev) continue;
      if (!allowedTypes.has(ev.type)) continue;

      let msg = ev.message || ev.type;
      if (ev.type === "offline") msg = `OFFLINE: ${msg}`.trim();
      if (ev.type === "error") msg = `ERRO: ${msg}`.trim();

      out.push({
        ts: ev.ts,
        streamer: ev.streamer,
        type: ev.type,
        message: msg,
      });
    }
  }

  out.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());

  const deduped = dedupeAlerts(out, 5 * 60 * 1000);
  return deduped.slice(0, limit);
}
function expandTypesParam(typesStr) {
  const raw = (typesStr || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const set = new Set(raw);

  if (set.has("all") || set.size === 0) {
    return new Set([
      "chat", "gift", "follow", "share", "member", "roomUser", "like"
    ]);
  }

  set.delete("alert");
  set.delete("system");
  ["goalUpdate", "pollMessage", "linkMicBattle", "roomPin"].forEach((t) => set.delete(t));
  ["error", "offline", "connected", "disconnected", "streamEnd"].forEach((t) => set.delete(t));

  return set;
}

async function buildEvents(dayStr, { streamer = "all", limit = 200, offset = 0, types = "chat,gift", q = "", untilTs = "" } = {}) {
  const events = await getEventsForDay(dayStr);
  const typeSet = expandTypesParam(types);
  const query = String(q || "").trim().toLowerCase();
  const untilMs = untilTs ? new Date(untilTs).getTime() : NaN;

  const out = [];
  for (const ev of events) {
    if (!Number.isNaN(untilMs)) {
      const evMs = new Date(ev.ts || 0).getTime();
      if (Number.isNaN(evMs) || evMs > untilMs) continue;
    }
    if (streamer !== "all" && ev.streamer !== streamer) continue;
    if (!typeSet.has(ev.type)) continue;
    if (query) {
      const hay = `${ev.streamer || ""} ${ev.type || ""} ${ev.user || ""} ${ev.message || ""}`.toLowerCase();
      if (!hay.includes(query)) continue;
    }
    out.push(ev);
  }

  const safeOffset = Math.max(0, Number(offset || 0));
  const slice = out.slice(safeOffset, safeOffset + limit);
  return {
    events: slice,
    totalFiltered: out.length,
    hasMore: safeOffset + slice.length < out.length,
    offset: safeOffset,
    untilTs: untilTs || null
  };
}

function minuteKeyFromTs(ts) {
  const ms = new Date(ts || 0).getTime();
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  d.setSeconds(0, 0);
  return d.toISOString();
}


async function buildAnomalies(dayStr, { streamer = "all", limit = 200 } = {}) {
  const events = await getEventsForDay(dayStr);
  const out = [];
  for (const ev of events) {
    if (ev.type !== "alert") continue;
    const alertType = String(ev?.data?.alertType || "");
    if (!alertType.startsWith("anomaly_") && !alertType.startsWith("watchdog_")) continue;
    if (streamer !== "all" && ev.streamer !== streamer) continue;

    out.push({
      ts: ev.ts,
      streamer: ev.streamer,
      type: alertType || "anomaly",
      message: ev.message || ev?.data?.message || "-"
    });
  }
  return out.slice(0, limit);
}

async function getHighlightUsersForDay(dayStr) {
  await rebuildIndexIfNeeded();
  const info = dayIndex.get(dayStr);
  if (!info) return [];
  if (!(await exists(HIGHLIGHT_ROOT))) return [];
  const users = await listDirs(HIGHLIGHT_ROOT);
  return users;
}

async function getHighlightFilesForDay(dayStr) {
  await rebuildIndexIfNeeded();
  const info = dayIndex.get(dayStr);
  if (!info) return [];

  const { year, month } = info;
  const users = await getHighlightUsersForDay(dayStr);

  const files = [];
  for (const user of users) {
    const filePath = path.join(HIGHLIGHT_ROOT, user, year, month, `${dayStr}.jsonl`);
    if (await exists(filePath)) files.push({ user, path: filePath });
  }
  return files;
}

async function buildHighlights(dayStr, { user = "all", streamer = "all", limit = 300, types = "all", q = "" } = {}) {
  const files = await getHighlightFilesForDay(dayStr);
  const typeSet = expandTypesParam(types);
  const query = String(q || "").trim().toLowerCase();

  const out = [];
  for (const f of files) {
    if (user !== "all" && f.user !== user) continue;

    const lines = await tailLastLines(f.path, 768 * 1024);
    for (const line of lines) {
      const obj = tryParseJson(line);
      const ev = normalizeEvent(obj);
      if (!ev) continue;
      ev.highlight = true;

      if (streamer !== "all" && ev.streamer !== streamer) continue;
      if (!typeSet.has(ev.type)) continue;

      if (query) {
        const hay = `${f.user} ${ev.streamer || ""} ${ev.type || ""} ${ev.user || ""} ${ev.message || ""}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }

      out.push({
        ts: ev.ts,
        highlightUser: f.user,
        streamer: ev.streamer,
        type: ev.type,
        user: ev.user,
        message: ev.message,
      });
    }
  }

  out.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
  return out.slice(0, limit);
}
function aggregateTopWithSources(items, field, topN = 25, perUserTopSources = 2) {
  const map = new Map();

  for (const it of items) {
    const streamer = it.streamer || "unknown";
    const list = Array.isArray(it[field]) ? it[field] : [];

    for (const [user, count] of list) {
      const u = String(user);
      const c = safeNumber(count, 0) ?? 0;

      if (!map.has(u)) map.set(u, { count: 0, sources: new Map() });

      const obj = map.get(u);
      obj.count += c;
      obj.sources.set(streamer, (obj.sources.get(streamer) || 0) + c);
    }
  }

  const arr = [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([user, info]) => {
      const sources = [...info.sources.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, perUserTopSources)
        .map(([streamer, count]) => ({ streamer, count }));

      return { user, count: info.count, sources };
    });

  return arr;
}

async function buildRankings(dayStr) {
  const summary = await buildSummaryCached(dayStr);
  const baseItems = summary.streamers || [];
  const streamerSet = new Set(baseItems.map((x) => x.streamer).filter(Boolean));
  const streamers = [...streamerSet];

  const rankingItems = [];
  for (const streamer of streamers) {
    const seriesData = await getSeriesForStreamer(dayStr, streamer);
    const viewersSeries = Array.isArray(seriesData?.series?.viewers) ? seriesData.series.viewers : [];
    const peakViewers = viewersSeries.reduce((acc, n) => Math.max(acc, safeNumber(n, 0) || 0), 0);
    const currentViewers = safeNumber(seriesData?.last?.viewers?.current, 0) || 0;
    const msgsPerMin = safeNumber(seriesData?.last?.msgsPerMin, 0) || 0;

    rankingItems.push({
      streamer,
      peakViewers,
      currentViewers,
      msgsPerMin
    });
  }

  const dayEvents = await getEventsForDay(dayStr);
  const chatsByStreamer = new Map();
  const giftsByStreamer = new Map();
  const chattersByStreamer = new Map();
  const giftersByStreamer = new Map();

  for (const ev of dayEvents) {
    const streamer = String(ev?.streamer || "").trim();
    if (!streamer) continue;
    streamerSet.add(streamer);

    if (ev.type === "chat") {
      chatsByStreamer.set(streamer, (chatsByStreamer.get(streamer) || 0) + 1);
      const user = String(ev?.user || "").trim();
      if (user) {
        if (!chattersByStreamer.has(streamer)) chattersByStreamer.set(streamer, new Map());
        const map = chattersByStreamer.get(streamer);
        map.set(user, (map.get(user) || 0) + 1);
      }
      continue;
    }

    if (ev.type === "gift") {
      const repeat = Math.max(1, safeNumber(ev?.data?.repeatCount, 1) || 1);
      giftsByStreamer.set(streamer, (giftsByStreamer.get(streamer) || 0) + repeat);
      const user = String(ev?.user || "").trim();
      if (user) {
        if (!giftersByStreamer.has(streamer)) giftersByStreamer.set(streamer, new Map());
        const map = giftersByStreamer.get(streamer);
        map.set(user, (map.get(user) || 0) + repeat);
      }
    }
  }

  const allStreamers = [...streamerSet];

  const byPeakViewers = [...rankingItems]
    .sort((a, b) => (b.peakViewers ?? 0) - (a.peakViewers ?? 0))
    .slice(0, 10)
    .map((x) => ({ streamer: x.streamer, value: x.peakViewers ?? 0 }));

  const byCurrentViewers = [...rankingItems]
    .sort((a, b) => (b.currentViewers ?? 0) - (a.currentViewers ?? 0))
    .slice(0, 10)
    .map((x) => ({ streamer: x.streamer, value: x.currentViewers ?? 0 }));

  const byMsgsPerMin = [...rankingItems]
    .sort((a, b) => (b.msgsPerMin ?? 0) - (a.msgsPerMin ?? 0))
    .slice(0, 10)
    .map((x) => ({ streamer: x.streamer, value: x.msgsPerMin ?? 0 }));

  const byTotalChats = [...allStreamers]
    .map((streamer) => ({ streamer, value: chatsByStreamer.get(streamer) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const byTotalGifts = [...allStreamers]
    .map((streamer) => ({ streamer, value: giftsByStreamer.get(streamer) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const topChattersByStreamer = [...chattersByStreamer.entries()].map(([streamer, m]) => ({
    streamer,
    topChatters: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  }));
  const topGiftersByStreamer = [...giftersByStreamer.entries()].map(([streamer, m]) => ({
    streamer,
    topGifters: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  }));

  const globalTopChatters = aggregateTopWithSources(topChattersByStreamer, "topChatters", 25, 2);
  const globalTopGifters = aggregateTopWithSources(topGiftersByStreamer, "topGifters", 25, 2);

  return {
    day: dayStr,
    leaderboards: { byPeakViewers, byCurrentViewers, byMsgsPerMin, byTotalChats, byTotalGifts },
    global: { topChatters: globalTopChatters, topGifters: globalTopGifters },
  };
}

async function buildRankingsCached(dayStr) {
  const snapSig = await getSnapshotSignature(dayStr);
  const evSig = await getEventsSignature(dayStr);
  const signature = `${snapSig}|${evSig}`;
  const cached = rankingsCache.get(dayStr);
  if (cached && cached.signature === signature) return cached.data;

  const data = await buildRankings(dayStr);
  putBoundedCache(rankingsCache, dayStr, { signature, data });
  return data;
}
app.use(express.static(PUBLIC_DIR, { maxAge: "0", etag: false, index: "index.html" }));

app.get("/", (req, res) => {
  if (fs.existsSync(INDEX_HTML)) return res.sendFile(INDEX_HTML);
  res.status(500).send(`<h2>index.html nÃ£o encontrado</h2><pre>${INDEX_HTML}</pre>`);
});

app.get("/favicon.ico", (req, res) => {
  const faviconPath = path.join(PUBLIC_DIR, "favicon.ico");
  if (fs.existsSync(faviconPath)) return res.sendFile(faviconPath);
  return res.status(204).end();
});
app.get("/api/days", async (req, res) => {
  const days = await getAvailableDays();
  res.json({ root: JSONL_ROOT, days, defaultDay: days[0] || null });
});

app.get("/api/summary", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).json({ error: "Missing day" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  res.json(await buildSummaryCached(day));
});

app.get("/api/streamer", async (req, res) => {
  const day = String(req.query.day || "");
  const streamer = String(req.query.streamer || "");
  if (!day || !streamer) return res.status(400).json({ error: "Missing day or streamer" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  const data = await getSeriesForStreamer(day, streamer);
  if (data) return res.json({ day, streamer, ...data });

  const evIndex = await getEventsIndex(day);
  const last = evIndex?.last?.[streamer] || null;
  const series = evIndex?.series?.[streamer] || { ts: [], msgsPerMin: [], viewers: [] };
  return res.json({ day, streamer, last, series });
});

app.get("/api/alerts", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).json({ error: "Missing day" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  const streamer = String(req.query.streamer || "all");
  const limit = Math.min(500, Math.max(10, Number(req.query.limit || 150)));
  const includeSystem = String(req.query.includeSystem || "1") !== "0";

  const alerts = await buildAlerts(day, { streamer, limit, includeSystem });
  res.json({ day, streamer, limit, includeSystem, alerts });
});

app.get("/api/events", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).json({ error: "Missing day" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  const streamer = String(req.query.streamer || "all");
  const limit = Math.min(2500, Math.max(20, Number(req.query.limit || 500)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const types = String(req.query.types || "chat,gift");
  const q = String(req.query.q || "");
  const untilTs = String(req.query.untilTs || "");

  const data = await buildEvents(day, { streamer, limit, offset, types, q, untilTs });
  res.json({ day, streamer, limit, offset, types, q, ...data });
});

app.get("/api/events-totals", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).json({ error: "Missing day" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  const streamer = String(req.query.streamer || "all");
  const data = await computeEventTotalsCached(day, { streamer });
  res.json(data);
});

app.get("/api/likes-total", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).json({ error: "Missing day" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  const streamer = String(req.query.streamer || "all");
  const untilTs = String(req.query.untilTs || "");
  const totals = await computeLikeTotals(day, { streamer, untilTs });
  const byStreamer = totals.byStreamer || [];
  const total = streamer === "all"
    ? totals.total
    : (byStreamer.find((it) => it.streamer === streamer)?.value ?? 0);

  res.json({ day, streamer, untilTs: untilTs || null, total, byStreamer });
});


app.get("/api/anomalies", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).json({ error: "Missing day" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  const streamer = String(req.query.streamer || "all");
  const limit = Math.min(500, Math.max(20, Number(req.query.limit || 220)));

  const anomalies = await buildAnomalies(day, { streamer, limit });
  res.json({ day, streamer, limit, anomalies });
});
app.get("/api/status", (req, res) => {
  const packageVersion = readPackageVersion();
  try {
    const data = fs.readFileSync(STATUS_PATH, "utf8");
    const parsed = JSON.parse(data);
    res.json({ ...parsed, version: packageVersion });
  } catch {
    res.json({
      version: packageVersion,
      uptimeMs: 0,
      health: "unknown",
      streamers: {}
    });
  }
});

app.get("/api/lists", (req, res) => {
  const streamers = readListWithFallback(STREAMERS_LIST_PATH, "streamers.txt");
  const highlightUsers = readListWithFallback(HIGHLIGHT_USERS_LIST_PATH, "highlight_users.txt");
  res.json({
    streamers,
    highlightUsers,
    meta: {
      root: ROOT,
      streamersPath: STREAMERS_LIST_PATH,
      highlightUsersPath: HIGHLIGHT_USERS_LIST_PATH
    }
  });
});

app.put("/api/lists/:kind", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const kind = String(req.params.kind || "").toLowerCase();
  const items = parseListPayload(req.body);
  if (!items) return res.status(400).json({ error: "Invalid payload. Use { items: [] } or { text: \"...\" }" });

  if (kind === "streamers") {
    writePlainList(STREAMERS_LIST_PATH, items);
    return res.json({ ok: true, kind, count: items.length });
  }
  if (kind === "highlight-users") {
    writePlainList(HIGHLIGHT_USERS_LIST_PATH, items);
    return res.json({ ok: true, kind, count: items.length });
  }

  return res.status(404).json({ error: "Unknown list kind", kind });
});

app.post("/api/admin/action", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const action = String(req.body?.action || "").trim().toLowerCase();
  const streamer = String(req.body?.streamer || "").trim().toLowerCase();
  const allowedActions = new Set(["pause", "resume", "reconnect", "clear_circuit", "clear_circuit_all"]);
  if (!allowedActions.has(action)) {
    return res.status(400).json({ error: "Invalid action", action, allowed: [...allowedActions] });
  }
  if (action !== "clear_circuit_all") {
    if (!streamer) return res.status(400).json({ error: "Missing streamer" });
    if (!/^[a-z0-9._]+$/.test(streamer)) return res.status(400).json({ error: "Invalid streamer format" });
  }

  const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    ts: new Date().toISOString(),
    source: "dashboard",
    action,
    streamer: streamer || "*"
  };

  try {
    ensureParentDir(ADMIN_COMMANDS_FILE);
    fs.appendFileSync(ADMIN_COMMANDS_FILE, `${JSON.stringify(record)}\n`, "utf8");
    return res.json({ ok: true, command: record });
  } catch (err) {
    return res.status(500).json({ error: "failed_to_write_command", details: String(err?.message || err) });
  }
});


app.get("/api/highlights", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).json({ error: "Missing day" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  const user = String(req.query.user || "all");
  const streamer = String(req.query.streamer || "all");
  const limit = Math.min(1000, Math.max(20, Number(req.query.limit || 300)));
  const types = String(req.query.types || "all");
  const q = String(req.query.q || "");

  const highlights = await buildHighlights(day, { user, streamer, limit, types, q });
  const users = await getHighlightUsersForDay(day);

  res.json({ day, user, streamer, limit, types, q, users, highlights });
});

app.get("/api/rankings", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).json({ error: "Missing day" });

  const dayPath = await getDayPath(day);
  if (!dayPath) return res.status(404).json({ error: "Day not found", day });

  res.json(await buildRankingsCached(day));
});
app.get("/api/sse", async (req, res) => {
  const day = String(req.query.day || "");
  if (!day) return res.status(400).end("Missing day");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let alive = true;
  req.on("close", () => { alive = false; });

  async function tick() {
    if (!alive) return;
    try {
      const data = await buildSummaryCached(day);
      res.write(`event: summary\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: "sse_tick_failed" })}\n\n`);
    }
    setTimeout(tick, 3000);
  }

  tick();
});

app.listen(PORT, HOST, async () => {
  await rebuildIndexIfNeeded(true);
  console.log(`âœ… Dashboard rodando em http://localhost:${PORT}`);
  console.log(`ðŸ“ Lendo snapshots de: ${JSONL_ROOT}`);
  console.log(`ðŸ“¦ Public dir: ${PUBLIC_DIR}`);
  console.log(`ðŸ“„ index.html existe? ${fs.existsSync(INDEX_HTML) ? "SIM" : "NÃƒO"}`);
});