import fs from "fs";
import chalk from "chalk";
import { SignConfig } from "tiktok-live-connector";

import { ensureDir, createBufferedWriter } from "./src/storage.js";
import { createStats } from "./src/stats.js";
import { createAlerts } from "./src/alerts.js";
import { createEventBus } from "./src/eventBus.js";
import { createConnectionManager } from "./src/connections.js";
import { createRuntimeConfig, loadConfigFromFile } from "./src/runtimeConfig.js";
import { createHealthServer } from "./src/healthServer.js";
import { createAnalytics } from "./src/analytics.js";
import { loadEnvFile } from "./src/env.js";
import { validateConfig } from "./src/configValidation.js";

loadEnvFile(".env");
let config = loadConfigFromFile("config.json");
const initialCfgValidation = validateConfig(config);
if (!initialCfgValidation.ok) {
  console.error("âŒ Invalid config.json:");
  for (const e of initialCfgValidation.errors) console.error(` - ${e}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const APP_NAME = "TTKLiveMonitor";
const APP_VERSION = pkg.version;
if (config?.tiktok?.signApiKey) {
  SignConfig.apiKey = config.tiktok.signApiKey;
  console.log("ðŸ” Sign API Key carregada.");
} else {
  console.log("âš ï¸ Nenhuma Sign API Key encontrada.");
}

ensureDir(config?.paths?.txtRoot || "logs");
ensureDir(config?.paths?.jsonlRoot || "logs_jsonl");
ensureDir("dashboard");
ensureDir("dashboard/reports");
const WARMUP_MS = config?.connectionWarmupTimeoutMs ?? 20000;

function isRateLimitErrorMessage(msg) {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("rate limited") ||
    m.includes("rate_limit_account_day") ||
    m.includes("too many connections started") ||
    m.includes("sign server message") ||
    m.includes("eulerstream")
  );
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeText(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

// A partir do tiktok-live-connector 2.x, o usuário vem aninhado em data.user
// (data.user.uniqueId / data.user.nickname), e não mais solto em data.uniqueId
// como na API antiga. Essa mudança de formato era a causa raiz dos nomes de
// usuário sumindo nos eventos de chat/gift/member/follow/share/like. Mantemos
// o fallback para o formato antigo por robustez.
function extractUser(data) {
  if (!data || typeof data !== "object") return null;
  return (
    data.user?.uniqueId ||
    data.uniqueId ||
    data.user?.nickname ||
    data.nickname ||
    null
  );
}

function numValue(n, fallback = null) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

const REAL_EVENT_TYPES = new Set([
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
  "roomPin",
  "quit"
]);

function isRealEventType(type) {
  return REAL_EVENT_TYPES.has(String(type || ""));
}

function updateSessionHealthFromConfig() {
  const sessionid = config?.tiktok?.sessionid || process.env.TIKTOK_SESSIONID || "";
  const ttTargetIdc = config?.tiktok?.ttTargetIdc || process.env.TIKTOK_TT_TARGET_IDC || "";
  const signApiKey = config?.tiktok?.signApiKey || process.env.TIKTOK_SIGN_API_KEY || "";
  sessionHealth.hasSessionId = !!String(sessionid || "").trim();
  sessionHealth.hasTtTargetIdc = !!String(ttTargetIdc || "").trim();
  sessionHealth.hasSignApiKey = !!String(signApiKey || "").trim();
}

function emitSessionAlert(alertType, message) {
  bus.emit(
    {
      ts: isoNow(),
      streamer: "system",
      type: "alert",
      data: {
        alertType,
        user: "-",
        message
      }
    },
    { getCurrentDateTime }
  );
}

function checkSessionConfig() {
  updateSessionHealthFromConfig();
  if (sessionHealth.hasSessionId && !sessionHealth.hasTtTargetIdc) {
    emitSessionAlert(
      "session_config",
      "SessionID definido sem tt-target-idc. Sessão será ignorada até ambos estarem presentes."
    );
  }
  if (!sessionHealth.hasSignApiKey) {
    emitSessionAlert(
      "sign_api_missing",
      "Sign API Key ausente. Conexões podem falhar em redes mais restritas."
    );
  }
}

function extractGiftDiamonds(data) {
  const candidates = [
    data?.giftDetails?.diamondCount,
    data?.extendedGiftInfo?.diamondCount,
    data?.diamondCount,
    data?.diamond,
    data?.gift?.diamondCount,
    data?.gift?.diamond,
    data?.gift?.diamondCost,
    data?.gift?.coinCount,
    data?.gift?.price,
    data?.gift?.value,
    data?.gift?.cost
  ];
  for (const c of candidates) {
    const v = numValue(c, null);
    if (v !== null) return v;
  }
  return null;
}

function currentViewerCount(data) {
  const direct = numValue(data?.viewerCount, null);
  if (direct !== null) return direct;

  const roomUser = numValue(data?.roomUserCount, null);
  if (roomUser !== null) return roomUser;

  return null;
}

function eventNonce(data) {
  if (!data || typeof data !== "object") return "";
  return String(
    data.msgId ??
    data.messageId ??
    data.logId ??
    data.createTime ??
    data.eventId ??
    ""
  );
}

function getCurrentDateTime(timezone) {
  const now = new Date();
  const options = { timeZone: timezone };
  return `${now.toLocaleDateString("pt-BR", options)} ${now.toLocaleTimeString("pt-BR", options)}`;
}
function getLogDirectory(timezone) {
  const now = new Date();
  const options = { timeZone: timezone };
  const meses = [
    "Janeiro","Fevereiro","MarÃ§o","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];
  const mes = meses[now.getMonth()];
  const ano = now.getFullYear();
  const dia = now.toLocaleDateString("pt-BR", options).replace(/\//g, "-");
  const dir = `logs/${ano}/${mes}/${dia}`;
  ensureDir(dir);
  return dir;
}

function loadList(path) {
  try {
    const list = fs
      .readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const seen = new Set();
    const dedup = [];
    for (const s of list) {
      if (seen.has(s)) {
        if (path === "streamers.txt") console.log(`âš ï¸ Streamer duplicado ignorado: ${s}`);
        continue;
      }
      seen.add(s);
      dedup.push(s);
    }
    return dedup;
  } catch (err) {
    console.error(`â— Falha ao ler ${path}:`, err);
    return [];
  }
}
const writer = createBufferedWriter({
  flushEveryMs: config.flushEveryMs,
  flushMaxLines: config.flushMaxLines,
  maxFileBytes: config?.logRotation?.maxFileBytes ?? 0,
  maxBackups: config?.logRotation?.maxBackups ?? 3
});

const stats = createStats();

let alerts = createAlerts({
  enabled: !!config.alerts?.enabled,
  keywords: config.alerts?.keywords || [],
  antiSpam: config.antiSpam,
  gifts: config.alerts?.gifts || null
});

let highlightUsers = loadList("highlight_users.txt");

let bus = createEventBus({
  timezone: config.timezone,
  getLogDirectory,
  writer,
  highlightUsers,
  alerts,
  config
});
const streamerStatus = {};
const lastActivity = {};
const recentEvents = {};
const offlineCooldownUntil = {};
const offlineCooldownTimers = {};
const pausedStreamers = {};
const autoPausedStreamers = {};
const autoPauseTimers = {};

function clearAutoPause(streamer) {
  if (autoPauseTimers[streamer]) {
    clearTimeout(autoPauseTimers[streamer]);
    delete autoPauseTimers[streamer];
  }
  delete autoPausedStreamers[streamer];
}

function scheduleAutoResume(streamer, ms, reason = "circuit_cooldown") {
  if (!Number.isFinite(ms) || ms <= 0) return;
  clearAutoPause(streamer);
  autoPausedStreamers[streamer] = true;
  autoPauseTimers[streamer] = setTimeout(() => {
    delete autoPauseTimers[streamer];
    if (!autoPausedStreamers[streamer]) return;
    delete autoPausedStreamers[streamer];
    delete pausedStreamers[streamer];
    streamerStatus[streamer] = "offline";
    try { connManager.resume(streamer); } catch {}
    monitorLive(streamer);
    bus.emit(
      {
        ts: isoNow(),
        streamer,
        type: "alert",
        data: {
          alertType: "auto_resumed",
          user: "-",
          message: "Auto-resume: retomado apos cooldown."
        }
      },
      { getCurrentDateTime }
    );
  }, ms);
}
const userIdleState = new Map();

const lastViewersLogAt = {};
const warmupTimers = {};
const sawAnyEvent = {};
const botStartedAt = Date.now();
const lastAttemptAt = {};
const reconnectCount = {};
const offlineSince = {};
const onlineSince = {};
const probingUntil = {};
const handledAdminCommandIds = new Set();
let adminCommandsCursor = 0;
const ADMIN_COMMANDS_FILE = "dashboard/commands.jsonl";
const likeLastTotalByStreamer = {};
const userIdleQuitMs = Number(config?.userIdleQuitMs ?? 5 * 60 * 1000);
const userIdleEnabled = Number.isFinite(userIdleQuitMs) && userIdleQuitMs > 0;
const USER_IDLE_CHECK_MS = userIdleEnabled ? Math.max(15_000, Math.min(60_000, Math.floor(userIdleQuitMs / 3))) : null;
const USER_IDLE_CLEANUP_MS = userIdleEnabled ? Math.max(userIdleQuitMs * 6, 60 * 60 * 1000) : null;
const opsMetrics = {
  reconnect_attempts_total: 0,
  watchdog_restarts_total: 0,
  circuit_open_total: 0,
  rate_limit_hits_total: 0,
  session_errors_total: 0,
  sign_errors_total: 0
};

const sessionHealth = {
  hasSessionId: false,
  hasTtTargetIdc: false,
  hasSignApiKey: false,
  lastErrorAt: null,
  lastErrorType: null,
  lastErrorMessage: null
};

const lastRealEventTs = {};
const lastRealEventType = {};

checkSessionConfig();

function clearLikeCounters(streamer) {
  delete likeLastTotalByStreamer[streamer];
}

function normalizeLikeDelta(streamer, likeData) {
  const s = String(streamer || "");
  if (!s) return 1;

  const eventLikes = numValue(likeData?.likeCount ?? likeData?.count, null);
  const totalLikes = numValue(likeData?.totalLikeCount, null);

  if (Number.isFinite(totalLikes) && totalLikes > 0) {
    const prevTotal = numValue(likeLastTotalByStreamer[s], null);
    likeLastTotalByStreamer[s] = totalLikes;

    if (Number.isFinite(prevTotal) && totalLikes > prevTotal) {
      return totalLikes - prevTotal;
    }
    if (Number.isFinite(eventLikes) && eventLikes > 0) return eventLikes;
    return 1;
  }

  if (Number.isFinite(eventLikes) && eventLikes > 0) return eventLikes;
  return 1;
}
function shouldResetSessionCounters(reason) {
  const r = String(reason || "").toLowerCase();
  if (!r) return false;
  return (
    r.includes("stream_end") ||
    r.includes("live ended") ||
    r.includes("room not found") ||
    r.includes("not active") ||
    r.includes("isn't online") ||
    r.includes("http_offline_confirmed") ||
    r.includes("live_ended_or_offline")
  );
}

function emitResetSnapshot(streamer, reason = "reset_session") {
  const snap = stats.snapshot(streamer, config?.snapshots?.topNSnapshot ?? 10);
  bus.emit(
    {
      ts: isoNow(),
      streamer,
      type: "snapshot",
      roomId: snap.roomId,
      data: {
        ...snap,
        resetReason: String(reason || "reset_session")
      }
    },
    { getCurrentDateTime }
  );
}

function writeSummaryFile(kind, id, payload) {
  const safeId = String(id || "unknown").replace(/[^\w.-]/g, "_");
  const file = `dashboard/reports/${kind}-${safeId}.json`;
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

const analytics = createAnalytics({
  timezone: config.timezone,
  anomalyConfigProvider: () => config?.anomaly || {},
  onDailySummary: (summary) => {
    writeSummaryFile("daily", summary.id, summary);
  },
  onWeeklySummary: (summary) => {
    writeSummaryFile("weekly", summary.id, summary);
  },
  onAnomaly: (a) => {
    bus.emit(
      {
        ts: a.ts || isoNow(),
        streamer: a.streamer,
        type: "alert",
        data: {
          alertType: `anomaly_${a.type}`,
          user: "-",
          message: a.message
        }
      },
      { getCurrentDateTime }
    );
  }
});
const connManager = createConnectionManager({

  onConnect: (streamer, roomId) => {
    console.log(`ðŸŸ¢ ${streamer} conectado`);

    streamerStatus[streamer] = "online";

    stats.onConnected(streamer, roomId ?? null);
    clearLikeCounters(streamer);

    bus.emit({
      ts: isoNow(),
      streamer,
      type: "connected",
      data: {}
    }, { getCurrentDateTime });
  },

  onDisconnect: (streamer, reason) => {
    console.log(`ðŸ”´ ${streamer} desconectado (${reason || "unknown"})`);
    opsMetrics.reconnect_attempts_total += 1;

    streamerStatus[streamer] = "offline";
    stats.onDisconnected(streamer);
    clearLikeCounters(streamer);
    clearUserIdleState(streamer);
    if (shouldResetSessionCounters(reason)) {
      stats.resetSession(streamer);
      clearLikeCounters(streamer);
      emitResetSnapshot(streamer, reason);
    }

    bus.emit({
      ts: isoNow(),
      streamer,
      type: "disconnected",
      data: {}
    }, { getCurrentDateTime });
  },

  onError: (streamer, err) => {
    console.log(`âš ï¸ ${streamer} erro:`, err?.message || err);
    if (isRateLimitErrorMessage(err?.message || err)) {
      opsMetrics.rate_limit_hits_total += 1;
    }
    const msg = String(err?.message || err || "");
    if (msg.toLowerCase().includes("tttargetidc")) {
      opsMetrics.session_errors_total += 1;
      sessionHealth.lastErrorAt = isoNow();
      sessionHealth.lastErrorType = "session_config";
      sessionHealth.lastErrorMessage = msg;
      emitSessionAlert("session_config", "tt-target-idc ausente para SessionID.");
    } else if (msg.toLowerCase().includes("sessionid")) {
      opsMetrics.session_errors_total += 1;
      sessionHealth.lastErrorAt = isoNow();
      sessionHealth.lastErrorType = "session_error";
      sessionHealth.lastErrorMessage = msg;
      emitSessionAlert("session_error", msg.slice(0, 200));
    } else if (msg.toLowerCase().includes("sign") || msg.toLowerCase().includes("euler")) {
      opsMetrics.sign_errors_total += 1;
      sessionHealth.lastErrorAt = isoNow();
      sessionHealth.lastErrorType = "sign_error";
      sessionHealth.lastErrorMessage = msg;
      emitSessionAlert("sign_error", msg.slice(0, 200));
    }
    streamerStatus[streamer] = "error";
  },

  onEvent: (streamer, type, data) => {

    updateHeartbeat(streamer);
    markEvent(streamer);
    analytics.recordEvent(streamer, type);
    if (isRealEventType(type)) {
      lastRealEventTs[streamer] = isoNow();
      lastRealEventType[streamer] = type;
    }

    if (type === "chat") {
      if (!data) return;

      const user = extractUser(data);
      // O tiktok-live-connector expõe o texto do chat como "content" (nome atual do
      // campo no protobuf da TikTok). "comment" é o nome antigo (API v0/v1) e sempre
      // vem undefined agora — por isso as mensagens apareciam em branco.
      const comment = normalizeText(data.content ?? data.comment);
      const nonce = eventNonce(data);

      recordUserActivity(streamer, user, "chat");

      const key = `chat:${user}:${comment}:${nonce}`;
      if (isDuplicateEvent(streamer, key)) return;

      stats.addChat(streamer, user);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "chat",
        roomId: stats.get(streamer).roomId,
        user,
        data: { comment }
      }, { getCurrentDateTime });
      bus.emitAlertFromChat({ streamer, user, comment }, { getCurrentDateTime });
    }

    else if (type === "gift") {
      if (!data) return;

      const user = extractUser(data);
      // O nome do gift vem em data.giftDetails.giftName na API atual da lib (confirmado
      // na doc oficial). data.extendedGiftInfo só existe se enableExtendedGiftInfo=true
      // (desligado por padrão — ver src/connections.js). Os demais fallbacks cobrem
      // formatos de versões antigas, por robustez.
      const giftName =
        data.giftDetails?.giftName ||
        data.extendedGiftInfo?.name ||
        data.extendedGiftInfo?.giftName ||
        data.giftName ||
        (data.gift && typeof data.gift === "object" ? data.gift.name : null) ||
        "Gift";
      const repeatCount = data.repeatCount ?? 1;
      const diamonds = extractGiftDiamonds(data);
      const totalDiamonds = diamonds != null ? diamonds * repeatCount : null;
      const nonce = eventNonce(data);

      recordUserActivity(streamer, user, "gift");

      const key = `gift:${user}:${giftName}:${repeatCount}:${nonce}`;
      if (isDuplicateEvent(streamer, key)) return;

      stats.addGift(streamer, user, repeatCount);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "gift",
        roomId: stats.get(streamer).roomId,
        user,
        data: {
          giftName,
          repeatCount,
          diamonds,
          totalDiamonds
        }
      }, { getCurrentDateTime });

      bus.emitAlertFromGift({
        streamer,
        user,
        giftName,
        repeatCount,
        diamonds,
        totalDiamonds
      }, { getCurrentDateTime });
    }

    else if (type === "member") {
      if (!data) return;

      const user = extractUser(data);
      const nonce = eventNonce(data);

      recordUserActivity(streamer, user, "member");

      const key = `member:${user}:${nonce}`;
      if (isDuplicateEvent(streamer, key)) return;

      stats.addMember(streamer);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "member",
        roomId: stats.get(streamer).roomId,
        user,
        data: {}
      }, { getCurrentDateTime });
    }

    else if (type === "follow") {
      const user = extractUser(data);
      const nonce = eventNonce(data);

      recordUserActivity(streamer, user, "follow");

      const key = `follow:${user}:${nonce}`;
      if (isDuplicateEvent(streamer, key)) return;

      stats.addFollow(streamer);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "follow",
        roomId: stats.get(streamer).roomId,
        user,
        data: {}
      }, { getCurrentDateTime });
    }

    else if (type === "share") {
      const user = extractUser(data);
      const nonce = eventNonce(data);

      recordUserActivity(streamer, user, "share");

      const key = `share:${user}:${nonce}`;
      if (isDuplicateEvent(streamer, key)) return;

      stats.addShare(streamer);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "share",
        roomId: stats.get(streamer).roomId,
        user,
        data: {}
      }, { getCurrentDateTime });
    }

    else if (type === "like") {
      const user = extractUser(data);
      const rawLike = data?.likeCount ?? data?.count ?? data?.totalLikeCount ?? 1;
      const nonce = eventNonce(data);

      recordUserActivity(streamer, user, "like");

      const key = `like:${user}:${rawLike}:${nonce}`;
      if (isDuplicateEvent(streamer, key, 1500)) return;

      const likeCount = numValue(data?.likeCount ?? data?.count, null);
      const totalLikeCount = numValue(data?.totalLikeCount, null);
      const likeDelta = normalizeLikeDelta(streamer, { likeCount, totalLikeCount });
      stats.addLike(streamer, likeDelta);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "like",
        roomId: stats.get(streamer).roomId,
        user,
        data: {
          likeCount: Number.isFinite(likeCount) && likeCount > 0 ? likeCount : Math.max(1, numValue(rawLike, 1) || 1),
          likeDelta,
          totalLikeCount: Number.isFinite(totalLikeCount) && totalLikeCount > 0 ? totalLikeCount : undefined
        }
      }, { getCurrentDateTime });
    }

    else if (type === "roomUser") {
      stats.addRoomUser(streamer);

      const viewerCount = currentViewerCount(data);

      if (typeof viewerCount === "number") stats.setViewers(streamer, viewerCount);
      const now = Date.now();
      const last = lastViewersLogAt[streamer] || 0;
      const minInterval = config.viewersLogMinIntervalMs ?? 30000;

      if (now - last >= minInterval) {
        lastViewersLogAt[streamer] = now;

        bus.emit({
          ts: isoNow(),
          streamer,
          type: "roomUser",
          roomId: stats.get(streamer).roomId,
          data: { viewerCount }
        }, { getCurrentDateTime });
      }
    }

    else if (type === "goalUpdate") {
      const goalId = data?.goal?.idStr || data?.goal?.id || data?.contributeSubgoal?.idStr || data?.contributeSubgoal?.id || data?.pinInfo?.subGoalIdStr || data?.pinInfo?.subGoalId || null;
      const progress = data?.contributeSubgoal?.progress ?? data?.goal?.progress ?? data?.contributeCount ?? null;
      const target = data?.contributeSubgoal?.target ?? data?.goal?.target ?? null;
      const contributor =
        data?.contributorDisplayId ||
        data?.contributorIdStr ||
        data?.contributorId ||
        null;
      const nonce = eventNonce(data);

      recordUserActivity(streamer, contributor, "goalUpdate");

      const key = `goalUpdate:${goalId || "-"}:${progress || "-"}:${target || "-"}:${nonce}`;
      if (isDuplicateEvent(streamer, key, 2500)) return;

      stats.addGoalUpdate(streamer);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "goalUpdate",
        roomId: stats.get(streamer).roomId,
        user: contributor,
        data: {
          goalId,
          progress: progress == null ? null : String(progress),
          target: target == null ? null : String(target),
          pin: !!data?.pin,
          unpin: !!data?.unpin
        }
      }, { getCurrentDateTime });
    }

    else if (type === "pollMessage") {
      const pollId = data?.pollId || data?.pollBasicInfo?.pollIdStr || null;
      const pollTitle = data?.pollBasicInfo?.title || null;
      const messageType = String(data?.messageType ?? "").toLowerCase();
      const pollState =
        messageType.includes("start") ? "start" :
        messageType.includes("end") ? "end" :
        messageType.includes("update") ? "update" : "update";
      const voters = data?.pollBasicInfo?.userCnt ?? null;
      const nonce = eventNonce(data);
      const key = `pollMessage:${pollId || "-"}:${pollState}:${nonce}`;
      if (isDuplicateEvent(streamer, key, 2000)) return;

      stats.addPollMessage(streamer);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "pollMessage",
        roomId: stats.get(streamer).roomId,
        data: {
          pollId,
          pollTitle,
          pollState,
          voters: voters == null ? null : String(voters)
        }
      }, { getCurrentDateTime });
    }

    else if (type === "linkMicBattle") {
      const battleId = data?.battleId || null;
      const action = data?.action == null ? null : String(data.action);
      const resultEntries = data?.battleResult && typeof data.battleResult === "object"
        ? Object.values(data.battleResult)
        : [];
      const scoreSummary = resultEntries
        .map((r) => `${r?.userId || "?"}:${r?.score || "0"}`)
        .filter(Boolean)
        .join(",");
      const nonce = eventNonce(data);
      const key = `linkMicBattle:${battleId || "-"}:${action || "-"}:${scoreSummary}:${nonce}`;
      if (isDuplicateEvent(streamer, key, 2000)) return;

      stats.addLinkMicBattle(streamer);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "linkMicBattle",
        roomId: stats.get(streamer).roomId,
        user: data?.actionByUserId || null,
        data: {
          battleId,
          action,
          scoreSummary: scoreSummary || null
        }
      }, { getCurrentDateTime });
    }

    else if (type === "roomPin") {
      const pinId = data?.pinId || null;
      const action = data?.action == null ? null : String(data.action);
      const pinType =
        data?.chatMessage ? "chat" :
        data?.giftMessage ? "gift" :
        data?.socialMessage ? "social" :
        data?.memberMessage ? "member" :
        data?.likeMessage ? "like" : "unknown";
      const preview =
        normalizeText(data?.chatMessage?.content ?? data?.chatMessage?.comment) ||
        normalizeText(data?.giftMessage?.giftName) ||
        normalizeText(data?.socialMessage?.action) ||
        normalizeText(data?.memberMessage?.user?.uniqueId) ||
        normalizeText(data?.likeMessage?.user?.uniqueId) ||
        "";
      const operator =
        data?.operator?.uniqueId ||
        data?.operator?.nickname ||
        null;
      const nonce = eventNonce(data);

      recordUserActivity(streamer, operator, "roomPin");

      const key = `roomPin:${pinId || "-"}:${action || "-"}:${pinType}:${preview}:${nonce}`;
      if (isDuplicateEvent(streamer, key, 2500)) return;

      stats.addRoomPin(streamer);

      bus.emit({
        ts: isoNow(),
        streamer,
        type: "roomPin",
        roomId: stats.get(streamer).roomId,
        user: operator,
        data: {
          pinId,
          action,
          pinType,
          preview,
          method: data?.method || null
        }
      }, { getCurrentDateTime });
    }
  },

  onCircuitOpen: (streamer, info) => {
    opsMetrics.circuit_open_total += 1;
    const minutes = Math.ceil((info?.cooldownMs || 0) / 60000);
    bus.emit(
      {
        ts: isoNow(),
        streamer,
        type: "error",
        data: {
          message: "circuit_breaker_open",
          details: `failures=${info?.failures || 0}, cooldown=${minutes}m, reason=${info?.reason || "unknown"}`
        }
      },
      { getCurrentDateTime }
    );

    const autoPauseCfg = config?.autoPauseOnCircuitOpen || {};
    if (autoPauseCfg?.enabled) {
      pausedStreamers[streamer] = true;
      streamerStatus[streamer] = "paused";
      try { connManager.pause(streamer); } catch {}
      bus.emit(
        {
          ts: isoNow(),
          streamer,
          type: "alert",
          data: {
            alertType: "auto_paused",
            user: "-",
            message: `Auto-pause: circuit breaker abriu (${minutes}m).`
          }
        },
        { getCurrentDateTime }
      );

      const autoResumeEnabled = autoPauseCfg.autoResume ?? true;
      const autoResumeMsRaw = numValue(autoPauseCfg.autoResumeMs, null);
      const resumeMs = autoResumeMsRaw != null ? autoResumeMsRaw : (info?.cooldownMs || 0);
      if (autoResumeEnabled) scheduleAutoResume(streamer, resumeMs, "circuit_cooldown");
    }
  },

  onHardPause: (streamer, info) => {
    // O circuito abriu várias vezes seguidas sem NENHUM evento real ter sido
    // recebido — não é instabilidade passageira, é bloqueio estrutural.
    // Cancela qualquer auto-resume agendado (senão o loop voltaria sozinho
    // em alguns minutos) e deixa o streamer pausado até intervenção manual.
    clearAutoPause(streamer);
    pausedStreamers[streamer] = true;
    streamerStatus[streamer] = "paused";

    bus.emit(
      {
        ts: isoNow(),
        streamer,
        type: "error",
        data: {
          message: "hard_paused_no_events_ever",
          details:
            `Circuito abriu ${info?.circuitOpenCount || 0}x sem receber nenhum evento. ` +
            "Verifique TIKTOK_SIGN_API_KEY/TIKTOK_SESSIONID nas variáveis de ambiente do host " +
            "e se o IP do servidor não está sendo limitado pelo TikTok/Euler Stream. " +
            "Pausado até retomada manual."
        }
      },
      { getCurrentDateTime }
    );
  },

  onWatchdogAnomaly: (streamer, info) => {
    opsMetrics.watchdog_restarts_total += 1;
    bus.emit(
      {
        ts: isoNow(),
        streamer,
        type: "alert",
        data: {
          alertType: `watchdog_${info?.type || "anomaly"}`,
          user: "-",
          message: `Watchdog: ${info?.type || "anomaly"}`
        }
      },
      { getCurrentDateTime }
    );
  },

  signApiKeyProvider: () => config?.tiktok?.signApiKey || process.env.TIKTOK_SIGN_API_KEY || null,
  // O cookie de sessão (sessionid + tt-target-idc) agora é montado corretamente em
  // src/connections.js via options.session.cookie (API real do tiktok-live-connector 2.x).
  // Aqui só sobra o user-agent customizado.
  headersProvider: () => ({
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
  }),
  optionsProvider: () => ({
    reconnect: {
      baseDelayMs: config?.adaptiveReconnect?.baseDelayMs ?? 1000,
      maxDelayMs: config?.adaptiveReconnect?.maxDelayMs ?? 120000,
      jitterMs: config?.adaptiveReconnect?.jitterMs ?? 1500,
      offlineDelayMs: config?.adaptiveReconnect?.offlineDelayMs ?? 30000,
      streamEndDelayMs: config?.adaptiveReconnect?.streamEndDelayMs ?? 120000,
      authDelayMs: config?.adaptiveReconnect?.authDelayMs ?? 600000,
      timeoutDelayMs: config?.adaptiveReconnect?.timeoutDelayMs ?? 15000,
      rateLimitDelayMs: (config?.tiktok?.rateLimitCooldownMinutes ?? 60) * 60 * 1000
    },
    circuitBreaker: {
      enabled: config?.circuitBreaker?.enabled ?? true,
      failureThreshold: config?.circuitBreaker?.failureThreshold ?? 6,
      cooldownMs: config?.circuitBreaker?.cooldownMs ?? 300000,
      hardPauseAfterOpens: config?.circuitBreaker?.hardPauseAfterOpens ?? 5
    },
    watchdog: {
      tickMs: config?.advancedWatchdog?.tickMs ?? 10000,
      noEventAfterConnectMs: config?.advancedWatchdog?.noEventAfterConnectMs ?? 30000,
      idleAnyEventMs: config?.advancedWatchdog?.idleAnyEventMs ?? 120000,
      idleInteractiveMs: config?.advancedWatchdog?.idleInteractiveMs ?? 180000,
      minViewersForInteractiveWatch: config?.advancedWatchdog?.minViewersForInteractiveWatch ?? 50
    },
    webTimeoutMs: config?.tiktok?.webTimeoutMs ?? 20000,
    wsTimeoutMs: config?.tiktok?.wsTimeoutMs ?? 20000,
    sessionId: (config?.tiktok?.sessionid || process.env.TIKTOK_SESSIONID) ?? null,
    ttTargetIdc: (config?.tiktok?.ttTargetIdc || process.env.TIKTOK_TT_TARGET_IDC) ?? null,
    // false por padrão: requer signApiKey com plano pago no Euler Stream para
    // buscar o catálogo estendido de gifts. Sem isso, quebra a conexão inteira.
    enableExtendedGiftInfo: config?.tiktok?.enableExtendedGiftInfo ?? false
  })
});

function hasActiveConnection(streamer) {
  const st = connManager.getStatus(streamer);
  return !!(st?.connected || st?.connecting);
}
function clearWarmup(streamer) {
  if (warmupTimers[streamer]) {
    clearTimeout(warmupTimers[streamer]);
    delete warmupTimers[streamer];
  }
}

function clearCooldownTimer(streamer) {
  if (offlineCooldownTimers[streamer]) {
    clearTimeout(offlineCooldownTimers[streamer]);
    delete offlineCooldownTimers[streamer];
  }
}

function confirmOnline(streamer) {
  if (streamerStatus[streamer] === "probing") {
    streamerStatus[streamer] = "online";
  }
  sawAnyEvent[streamer] = true;
  clearWarmup(streamer);
  onlineSince[streamer] = Date.now();
  delete offlineSince[streamer];
  delete probingUntil[streamer];
}

function markEvent(streamer) {
  updateHeartbeat(streamer);
  confirmOnline(streamer);
}
function isDuplicateEvent(streamer, key, ttl = config.dedupeTtlMs) {
  const effectiveTtl = Number(ttl ?? config?.dedupeTtlMs ?? 10000) || 10000;
  const now = Date.now();
  if (!recentEvents[streamer]) recentEvents[streamer] = {};
  const last = recentEvents[streamer][key];
  if (!last || now - last > effectiveTtl) {
    recentEvents[streamer][key] = now;
    return false;
  }
  return true;
}

function normalizeUserId(user) {
  const u = String(user || "").trim();
  return u || null;
}

function ensureUserIdleMap(streamer) {
  if (!userIdleState.has(streamer)) userIdleState.set(streamer, new Map());
  return userIdleState.get(streamer);
}

function recordUserActivity(streamer, user, type) {
  if (!userIdleEnabled) return;
  if (!streamer) return;
  const u = normalizeUserId(user);
  if (!u) return;
  const now = Date.now();
  const map = ensureUserIdleMap(streamer);
  const prev = map.get(u) || {};
  map.set(u, {
    lastTs: now,
    lastType: type || prev.lastType || null,
    lastEventTs: isoNow(),
    quitEmittedAt: 0
  });
}

function clearUserIdleState(streamer) {
  if (!streamer) return;
  userIdleState.delete(streamer);
}

function emitUserQuit(streamer, user, entry, idleMs, quitAtIso = null) {
  bus.emit(
    {
      ts: quitAtIso || isoNow(),
      streamer,
      type: "quit",
      user,
      data: {
        idleMs,
        quitAt: quitAtIso || null,
        lastEventTs: entry?.lastEventTs || null,
        lastEventType: entry?.lastType || null
      }
    },
    { getCurrentDateTime }
  );
}

function checkUserIdleQuit() {
  if (!userIdleEnabled) return;
  const now = Date.now();
  for (const [streamer, map] of userIdleState.entries()) {
    if (streamerStatus[streamer] !== "online") continue;
    for (const [user, entry] of map.entries()) {
      if (!entry?.lastTs) continue;
      const idleMs = now - entry.lastTs;
      if (idleMs >= userIdleQuitMs && (!entry.quitEmittedAt || entry.quitEmittedAt < entry.lastTs)) {
        const quitAtMs = entry.lastTs + userIdleQuitMs;
        const quitAtIso = new Date(quitAtMs).toISOString();
        const idleMsAtQuit = userIdleQuitMs;
        entry.quitEmittedAt = now;
        map.set(user, entry);
        emitUserQuit(streamer, user, entry, idleMsAtQuit, quitAtIso);
      }
      if (entry.quitEmittedAt && idleMs >= USER_IDLE_CLEANUP_MS) {
        map.delete(user);
      }
    }
    if (!map.size) userIdleState.delete(streamer);
  }
}

function cleanupRecentEvents() {
  const now = Date.now();
  const MAX_AGE = config.dedupeKeepMs;
  for (const [streamer, map] of Object.entries(recentEvents)) {
    for (const [k, ts] of Object.entries(map)) {
      if (now - ts > MAX_AGE) delete map[k];
    }
  }
}
setInterval(cleanupRecentEvents, config.dedupeCleanupEveryMs);
if (userIdleEnabled) setInterval(checkUserIdleQuit, USER_IDLE_CHECK_MS);
function updateHeartbeat(streamer) {
  lastActivity[streamer] = Date.now();
}

function checkHeartbeat() {
  const now = Date.now();

  for (const [streamer, time] of Object.entries(lastActivity)) {

    if (now - time > config.heartbeatTimeoutMs && streamerStatus[streamer] === "online") {
      console.warn(`â³ ${streamer} sem atividade hÃ¡ tempo demais. Reconectando (V8)...`);
      try { connManager.reconnect(streamer); } catch {}
      streamerStatus[streamer] = "offline";
      stats.onDisconnected(streamer);
    clearLikeCounters(streamer);
    }
  }
}
setInterval(checkHeartbeat, 60_000);

function getEffectiveStreamerStatus(streamer, connState = null) {
  if (pausedStreamers[streamer]) return "paused";
  const conn = connState || connManager.getStatus(streamer) || {};
  if (conn.connected) return "online";
  if (conn.connecting) return "probing";
  const raw = String(streamerStatus[streamer] || "").toLowerCase();
  if (raw === "paused") return "paused";
  if (raw === "online") return "online";
  if (raw === "probing") return "probing";
  return "offline";
}

function applyCooldown(streamer, minutes, reason, details) {
  const ms = Math.max(1, minutes) * 60 * 1000;
  offlineCooldownUntil[streamer] = Date.now() + ms;

  clearCooldownTimer(streamer);
  offlineCooldownTimers[streamer] = setTimeout(() => {
    delete offlineCooldownTimers[streamer];

    if (!hasActiveConnection(streamer)) {
      monitorLive(streamer);
    }
  }, ms + 250);

  streamerStatus[streamer] = "offline";
  if (shouldResetSessionCounters(reason)) {
    stats.onDisconnected(streamer);
    clearLikeCounters(streamer);
    stats.resetSession(streamer);
    emitResetSnapshot(streamer, reason);
  }
  if (!offlineSince[streamer]) offlineSince[streamer] = Date.now();
  delete onlineSince[streamer];
  delete probingUntil[streamer];

  console.log(`ðŸ§Š ${streamer}: cooldown ${minutes} min (${reason}${details ? `: ${details}` : ""}).`);
  bus.emit(
    {
      ts: isoNow(),
      streamer,
      type: "offline",
      data: { reason, details }
    },
    { getCurrentDateTime }
  );
}

function monitorLive(streamer) {
  if (pausedStreamers[streamer]) return;
  if (offlineCooldownUntil[streamer] && Date.now() < offlineCooldownUntil[streamer]) {
    streamerStatus[streamer] = "offline";
    return;
  } else if (offlineCooldownUntil[streamer]) {
    delete offlineCooldownUntil[streamer];
  }

  const st = connManager.getStatus(streamer);
  if (st?.connected || st?.connecting) {
    return;
  }
  lastAttemptAt[streamer] = Date.now();
  reconnectCount[streamer] = (reconnectCount[streamer] || 0) + 1;
  connManager.connect(streamer);
}
function maybeEmitSpike(streamer, currentMsgsPerMin, prevMsgsPerMin) {
  if (!config?.spike?.enabled) return;

  const minMsgs = config.spike.minMsgsPerMin ?? 25;
  const mult = config.spike.multiplier ?? 2.0;
  const minDelta = config.spike.minDelta ?? 15;

  if (currentMsgsPerMin < minMsgs) return;
  if (typeof prevMsgsPerMin !== "number") return;

  const delta = currentMsgsPerMin - prevMsgsPerMin;
  if (delta < minDelta) return;

  if (prevMsgsPerMin > 0 && currentMsgsPerMin >= prevMsgsPerMin * mult) {
    bus.emit(
      {
        ts: isoNow(),
        streamer,
        type: "alert",
        data: {
          alertType: "spike",
          user: "-",
          message: `Chat spike: msgs/min ${currentMsgsPerMin} (prev ${prevMsgsPerMin}, +${delta})`
        }
      },
      { getCurrentDateTime }
    );
  }
}

function runSnapshots() {
  if (!config?.snapshots?.enabled) return;

  const interval = config.snapshots.intervalMs ?? 30000;
  const topN = config.snapshots.topNSnapshot ?? 10;

  setInterval(() => {
    for (const streamer of Object.keys(streamerStatus)) {
      const connState = connManager.getStatus(streamer);
      if (!connState?.connected) continue;
      if (!pausedStreamers[streamer]) streamerStatus[streamer] = "online";
      const st = stats.get(streamer);
      if (!st.connectedAt) stats.onConnected(streamer, connState.roomId ?? st.roomId ?? null);

      const snap = stats.snapshot(streamer, topN);
      const now = Date.now();
      const last = stats.getLastSnapshot(streamer);
      analytics.recordSnapshot(streamer, { ...snap, ts: isoNow() });

      if (last?.at) maybeEmitSpike(streamer, snap.msgsPerMin, last.msgsPerMin);

      bus.emit(
        {
          ts: isoNow(),
          streamer,
          type: "snapshot",
          roomId: snap.roomId,
          data: snap
        },
        { getCurrentDateTime }
      );

      stats.updateLastSnapshot(streamer, { at: now, msgsPerMin: snap.msgsPerMin });
    }
  }, interval);
}
function fmtTop(list, n) {
  if (!list?.length) return "-";
  return list.slice(0, n).map(([u, c]) => `${u}(${c})`).join(", ");
}

function fmtHM(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  if (hh > 0) return `${hh}h${mm}m`;
  return `${mm}m`;
}

function displayStreamerStatus() {

  console.clear();

  console.log(`🚀 TTKLiveMonitor V${pkg.version}`);

  const uptimeMs = Date.now() - botStartedAt;

  const uh = Math.floor(uptimeMs / 3600000);
  const um = Math.floor((uptimeMs % 3600000) / 60000);
  let cOnline = 0, cOffline = 0, cProbing = 0, cPaused = 0, cDegraded = 0;

  const connStatus = connManager.getAllStatus();
  for (const s of streamers) {
    const effective = getEffectiveStreamerStatus(s, connStatus[s]);
    if (!pausedStreamers[s]) streamerStatus[s] = effective;

    if (effective === "paused") cPaused++;
    else if (effective === "online") cOnline++;
    else if (effective === "offline") cOffline++;
    else if (effective === "probing") cProbing++;

    const hasConn = hasActiveConnection(s);

    const inCooldown =
      offlineCooldownUntil[s] &&
      Date.now() < offlineCooldownUntil[s];

    if (effective === "offline" && !hasConn && !inCooldown)
      cDegraded++;
  }
  const HEALTH =
    cDegraded > 0
      ? `DEGRADED (${cDegraded} sem retry)`
      : "OK";
  const summaries = analytics.getCurrentSummary();
  const statusSnapshot = {
    version: pkg.version,
    uptimeMs: Date.now() - botStartedAt,
    ts: isoNow(),
    health: HEALTH,
    counts: {
      online: cOnline,
      probing: cProbing,
      offline: cOffline,
      paused: cPaused,
      degraded: cDegraded
    },
    summaries,
    streamers: {}
  };

  for (const s of streamers) {
    const effective = getEffectiveStreamerStatus(s, connStatus[s]);
    statusSnapshot.streamers[s] = {
      status: effective,
      reconnects: reconnectCount[s] || 0,
      lastAttemptAt: lastAttemptAt[s] || null,
      onlineSince: onlineSince[s] || null,
      offlineSince: offlineSince[s] || null,
      cooldownUntil: offlineCooldownUntil[s] || null,
      paused: !!pausedStreamers[s],
      connection: connStatus[s] || null
    };
  }
  try {
    fs.writeFileSync(
      "dashboard/status.json",
      JSON.stringify(statusSnapshot, null, 2)
    );
  } catch {}

  console.log(
    chalk.cyan(
      `Uptime: ${uh}h ${um}m | HEALTH: ${HEALTH} | online=${cOnline} probing=${cProbing} offline=${cOffline} paused=${cPaused}`
    )
  );

  const topNConsole = config?.snapshots?.topNConsole ?? 3;

  for (const [streamer, status] of Object.entries(streamerStatus)) {

    let txt = chalk.gray("â“ DESCONHECIDO");

    const last =
      lastAttemptAt[streamer]
        ? new Date(lastAttemptAt[streamer]).toLocaleTimeString("pt-BR")
        : "-";

    const rec = reconnectCount[streamer] || 0;

    const offForMs =
      offlineSince[streamer]
        ? Date.now() - offlineSince[streamer]
        : 0;

    const onForMs =
      onlineSince[streamer]
        ? Date.now() - onlineSince[streamer]
        : 0;

    if (status === "online") {

      const mpm = stats.msgsPerMin(streamer);

      const v = stats.get(streamer).viewers.current ?? "-";

      const topChat =
        fmtTop(stats.topChatters(streamer, topNConsole), topNConsole);

      const topGift =
        fmtTop(stats.topGifters(streamer, topNConsole), topNConsole);

      txt =
        chalk.green(`âœ”ï¸ ONLINE hÃ¡ ${fmtHM(onForMs)}`)
        + chalk.gray(` | msgs/min: ${mpm} | viewers: ${v}`)
        + chalk.gray(` | top chat: ${topChat}`)
        + chalk.gray(` | top gift: ${topGift}`);
    }

    else if (status === "probing") {

      const left =
        probingUntil[streamer]
          ? Math.max(
              0,
              Math.ceil(
                (probingUntil[streamer] - Date.now()) / 1000
              )
            )
          : Math.round(WARMUP_MS / 1000);

      txt =
        chalk.yellow(
          `ðŸŸ¡ PROBING (aguardando eventos... ${left}s)`
        );
    }

    else if (pausedStreamers[streamer]) {
      txt = chalk.blue(`â¸ PAUSED`);
    }

    else if (status === "offline") {

      if (
        offlineCooldownUntil[streamer]
        && Date.now() < offlineCooldownUntil[streamer]
      ) {

        const seconds =
          Math.max(
            0,
            Math.ceil(
              (offlineCooldownUntil[streamer] - Date.now()) / 1000
            )
          );

        txt =
          chalk.yellow(
            `â³ OFFLINE hÃ¡ ${fmtHM(offForMs)} (tentando em ${seconds}s)`
          );
      }

      else {
        txt =
          chalk.red(
            `âŒ OFFLINE hÃ¡ ${fmtHM(offForMs)}`
          );
      }
    }

    else if (status === "error") {
      txt =
        chalk.yellow("âš ï¸ ERRO");
    }

    console.log(
      `${streamer}: ${txt}`
      + chalk.gray(
          ` | reconnects: ${rec} | Ãºltima tentativa: ${last}`
        )
    );
  }

}
let streamers = loadList("streamers.txt");

function rebuildBusIfNeeded() {
  bus = createEventBus({
    timezone: config.timezone,
    getLogDirectory,
    writer,
    highlightUsers,
    alerts,
    config
  });
}

function rebuildAlertsIfNeeded() {
  alerts = createAlerts({
    enabled: !!config.alerts?.enabled,
    keywords: config.alerts?.keywords || [],
    antiSpam: config.antiSpam,
    gifts: config.alerts?.gifts || null
  });
}

function applyRuntimeConfig(nextConfig) {
  const check = validateConfig(nextConfig);
  if (!check.ok) {
    console.warn("âš ï¸ config.json invÃ¡lido; mantendo configuraÃ§Ã£o anterior.");
    for (const e of check.errors) console.warn(` - ${e}`);
    return;
  }

  config = nextConfig;

  ensureDir(config?.paths?.txtRoot || "logs");
  ensureDir(config?.paths?.jsonlRoot || "logs_jsonl");
  ensureDir(config?.paths?.highlightRoot || "logs_highlight");
  ensureDir("dashboard");
  ensureDir("dashboard/reports");

  if (config?.tiktok?.signApiKey) {
    SignConfig.apiKey = config.tiktok.signApiKey;
  }

  rebuildAlertsIfNeeded();
  rebuildBusIfNeeded();
  checkSessionConfig();
}

const runtimeConfig = createRuntimeConfig({
  configPath: "config.json",
  pollMs: 3000,
  onReload: (nextConfig) => {
    applyRuntimeConfig(nextConfig);
    console.log("ðŸ”„ config.json recarregado.");
  }
});

function checkForUpdates() {
  const newStreamers = loadList("streamers.txt");
  const newHighlightUsers = loadList("highlight_users.txt");

  newStreamers.forEach((s) => {
    if (!streamers.includes(s)) {
      console.log(`âš ï¸ Novo streamer adicionado: ${s}`);
      streamers.push(s);
      streamerStatus[s] = "offline";
      monitorLive(s);
    }
  });

  streamers = streamers.filter((s) => {
    if (!newStreamers.includes(s)) {
      console.log(`âŒ Streamer removido: ${s}`);
      try { connManager.disconnect(s); } catch {}

      delete streamerStatus[s];
      delete lastActivity[s];
      delete recentEvents[s];
      delete lastViewersLogAt[s];
      delete sawAnyEvent[s];
      clearUserIdleState(s);
      clearLikeCounters(s);
      delete offlineCooldownUntil[s];
      delete lastAttemptAt[s];
      delete reconnectCount[s];
      delete offlineSince[s];
      delete onlineSince[s];
      delete probingUntil[s];
      clearCooldownTimer(s);
      clearWarmup(s);
      delete pausedStreamers[s];
      clearAutoPause(s);

      return false;
    }
    return true;
  });

  if (JSON.stringify(newHighlightUsers) !== JSON.stringify(highlightUsers)) {
    highlightUsers = newHighlightUsers;
    console.log("â­ Lista de destaques atualizada:");
    highlightUsers.forEach(u => console.log(`- ${u}`));
    rebuildBusIfNeeded();
  }
}

function applyAdminAction(cmd) {
  const action = String(cmd?.action || "").toLowerCase();
  const streamer = String(cmd?.streamer || "").trim();
  if (!streamer || !streamers.includes(streamer)) return;

  if (action === "pause") {
    clearAutoPause(streamer);
    pausedStreamers[streamer] = true;
    streamerStatus[streamer] = "paused";
    try { connManager.pause(streamer); } catch {}
    return;
  }
  if (action === "resume") {
    clearAutoPause(streamer);
    delete pausedStreamers[streamer];
    streamerStatus[streamer] = "offline";
    try { connManager.resume(streamer); } catch {}
    monitorLive(streamer);
    return;
  }
  if (action === "reconnect") {
    if (pausedStreamers[streamer]) return;
    try { connManager.forceReconnect(streamer); } catch {}
    return;
  }
  if (action === "clear_circuit") {
    try { connManager.clearCircuit(streamer); } catch {}
  }
  if (action === "clear_circuit_all") {
    for (const s of streamers) {
      try { connManager.clearCircuit(s); } catch {}
    }
  }
}

function processAdminCommands() {
  if (!fs.existsSync(ADMIN_COMMANDS_FILE)) return;
  let content = "";
  try {
    content = fs.readFileSync(ADMIN_COMMANDS_FILE, "utf8");
  } catch {
    return;
  }

  if (adminCommandsCursor > content.length) adminCommandsCursor = 0;
  const chunk = content.slice(adminCommandsCursor);
  adminCommandsCursor = content.length;
  const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    try {
      const cmd = JSON.parse(line);
      const id = String(cmd?.id || `${cmd?.ts || ""}:${cmd?.action || ""}:${cmd?.streamer || ""}`);
      if (handledAdminCommandIds.has(id)) continue;
      handledAdminCommandIds.add(id);
      if (handledAdminCommandIds.size > 10000) handledAdminCommandIds.clear();
      applyAdminAction(cmd);
    } catch {}
  }
}

function buildHealthStatus() {
  const streamersHealth = {};
  const connStatus = connManager.getAllStatus();

  for (const s of streamers) {
    const effective = getEffectiveStreamerStatus(s, connStatus[s]);
    streamersHealth[s] = {
      status: effective,
      paused: !!pausedStreamers[s],
      reconnects: reconnectCount[s] || 0,
      lastAttemptAt: lastAttemptAt[s] || null,
      onlineSince: onlineSince[s] || null,
      offlineSince: offlineSince[s] || null,
      cooldownUntil: offlineCooldownUntil[s] || null,
      connection: connStatus[s] || null
    };
  }

  const summary = analytics.getCurrentSummary();

  return {
    app: APP_NAME,
    version: APP_VERSION,
    ts: isoNow(),
    uptimeMs: Date.now() - botStartedAt,
    metrics: { ...opsMetrics },
    config: {
      timezone: config?.timezone,
      healthPort: config?.health?.port ?? 8787
    },
    streamers: streamersHealth,
    summaries: summary,
    session: {
      hasSessionId: sessionHealth.hasSessionId,
      hasTtTargetIdc: sessionHealth.hasTtTargetIdc,
      hasSignApiKey: sessionHealth.hasSignApiKey,
      lastErrorAt: sessionHealth.lastErrorAt,
      lastErrorType: sessionHealth.lastErrorType,
      lastErrorMessage: sessionHealth.lastErrorMessage
    },
    lastRealEvents: Object.fromEntries(
      Object.keys(streamersHealth).map((s) => [
        s,
        {
          lastTs: lastRealEventTs[s] || null,
          lastType: lastRealEventType[s] || null
        }
      ])
    )
  };
}

const healthServer = createHealthServer({
  host: config?.health?.host || process.env.HEALTH_HOST || "0.0.0.0",
  port: Number(config?.health?.port ?? process.env.HEALTH_PORT ?? 8787),
  getHealth: buildHealthStatus
});

function startMonitoring() {
  streamers.forEach((streamer, i) => setTimeout(() => {
    console.log(`âš ï¸ Monitorando ${streamer}`);
    streamerStatus[streamer] = "offline";
    monitorLive(streamer);
  }, i * config.connectStaggerMs));
}

startMonitoring();
runtimeConfig.start();
healthServer.start();
setInterval(() => analytics.rotateIfNeeded(), 30000);
setInterval(processAdminCommands, 2000);
setInterval(() => {
  console.log("ðŸ” Security reminder: rotate TIKTOK_SESSIONID and TIKTOK_SIGN_API_KEY regularly.");
}, 24 * 60 * 60 * 1000);
setInterval(checkForUpdates, config.updateListsMs);
setInterval(displayStreamerStatus, config.statusRefreshMs);
runSnapshots();

process.on("SIGINT", () => {
  console.log("\nðŸ§¹ Fechando... flush logs e desconectando.");
  runtimeConfig.stop();
  healthServer.stop();
  analytics.flush();
  writer.flushAll();
  try {
    for (const s of streamers) {
      try { connManager.disconnect(s); } catch {}
    }
  } catch {}

  setTimeout(() => process.exit(0), 500);
});