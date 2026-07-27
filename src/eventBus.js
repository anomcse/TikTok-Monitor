export function createEventBus({
  timezone,
  getLogDirectory,
  writer,
  highlightUsers,
  alerts,
  config
}) {
  function isoNow() {
    return new Date().toISOString();
  }

  const TXT_ROOT = config?.paths?.txtRoot || "logs";
  const JSONL_ROOT = config?.paths?.jsonlRoot || "logs_jsonl";
  const HIGHLIGHT_ROOT = config?.paths?.highlightRoot || "logs_highlight";
  const BUS_DEDUPE_TTL_MS = config?.eventBusDedupeTtlMs ?? 8000;
  const busDedupe = new Map();

  function getTxtDir() {
    const dir = getLogDirectory(timezone);
    if (dir.startsWith("logs/")) return dir.replace(/^logs\//, `${TXT_ROOT}/`);
    if (dir === "logs") return TXT_ROOT;
    return dir;
  }

  function getJsonlDir() {
    const dir = getLogDirectory(timezone);
    if (dir.startsWith("logs/")) return dir.replace(/^logs\//, `${JSONL_ROOT}/`);
    if (dir === "logs") return JSONL_ROOT;
    return dir;
  }

  function makeTxtLine(streamer, text, getCurrentDateTime) {
    return `[${getCurrentDateTime(timezone)}] [ðŸŽ¥${streamer}]: ${text}\n`;
  }

  function writeTxt(streamer, line) {
    const file = `${getTxtDir()}/${streamer} L.txt`;
    writer.queue(file, line);
  }

  function writeHighlightJsonl(user, eventObj) {
    const dir = getLogDirectory(timezone);
    const datePath = dir.startsWith("logs/") ? dir.replace(/^logs\//, "") : (dir === "logs" ? "" : dir);
    const safeUser = String(user || "").trim().toLowerCase();
    const file = `${HIGHLIGHT_ROOT}/${safeUser}/${datePath}.jsonl`;

    writer.queue(file, JSON.stringify(eventObj) + "\n");
  }

  function writeEventsJsonl(streamer, obj) {
    const file = `${getJsonlDir()}/${streamer} events.jsonl`;
    writer.queue(file, JSON.stringify(obj) + "\n");
  }

  function writeSnapshotsJsonl(streamer, obj) {
    const file = `${getJsonlDir()}/${streamer} snapshots.jsonl`;
    writer.queue(file, JSON.stringify(obj) + "\n");
  }
  const highlightSet = new Set(
    (highlightUsers || [])
      .map(u => String(u).trim().toLowerCase())
      .filter(Boolean)
  );

  function isHighlightedUser(user) {
    if (!user) return false;
    const u = String(user).trim().toLowerCase();
    if (!u) return false;
    return highlightSet.has(u);
  }

  function getEventDedupeKey(event) {
    const t = event?.type || "-";
    const s = event?.streamer || "-";
    const u = event?.user || "-";
    const d = event?.data || {};

    if (t === "chat") return `${s}|chat|${u}|${String(d.comment || "").trim()}`;
    if (t === "gift") return `${s}|gift|${u}|${d.giftName || "-"}|${d.repeatCount || 1}`;
    if (t === "member") return `${s}|member|${u}`;
    if (t === "follow") return `${s}|follow|${u}`;
    if (t === "share") return `${s}|share|${u}`;
    if (t === "like") return `${s}|like|${u}|${d.likeCount ?? d.totalLikeCount ?? d.count ?? 1}`;
    if (t === "roomUser") return `${s}|roomUser|${d.viewerCount ?? "-"}`;
    if (t === "goalUpdate") return `${s}|goalUpdate|${d.goalId ?? "-"}|${d.progress ?? "-"}|${d.target ?? "-"}`;
    if (t === "pollMessage") return `${s}|pollMessage|${d.pollId ?? "-"}|${d.pollTitle ?? "-"}|${d.pollState ?? "-"}`;
    if (t === "linkMicBattle") return `${s}|linkMicBattle|${d.battleId ?? "-"}|${d.action ?? "-"}|${d.scoreSummary ?? "-"}`;
    if (t === "roomPin") return `${s}|roomPin|${d.pinId ?? "-"}|${d.action ?? "-"}|${d.pinType ?? "-"}|${d.preview ?? "-"}`;
    if (t === "alert") return `${s}|alert|${d.alertType || "-"}|${String(d.message || "").trim()}`;
    if (t === "error") return `${s}|error|${String(d.message || "").trim()}|${String(d.details || "").trim()}`;
    if (t === "connected" || t === "disconnected") return `${s}|${t}`;
    if (t === "quit") return `${s}|quit|${u}|${d.lastEventTs ?? "-"}`;
    return `${s}|${t}|${u}|${JSON.stringify(d)}`;
  }

  function isDuplicateAtBus(event) {
    const now = Date.now();
    const key = getEventDedupeKey(event);
    const last = busDedupe.get(key) || 0;
    if (now - last <= BUS_DEDUPE_TTL_MS) return true;
    busDedupe.set(key, now);
    if (busDedupe.size > 8000) {
      for (const [k, ts] of busDedupe.entries()) {
        if (now - ts > BUS_DEDUPE_TTL_MS * 4) busDedupe.delete(k);
      }
    }

    return false;
  }

function emit(event, { getCurrentDateTime }) {
    if (!event?.streamer || !event?.type) return;
    if (isDuplicateAtBus(event)) return;
    if (event.type === "snapshot") {
      writeSnapshotsJsonl(event.streamer, event);
      return;
    }
    writeEventsJsonl(event.streamer, event);

    const t = event.type;
    const s = event.streamer;

    if (t === "chat") {
      const user = event.user;
      const comment = event.data?.comment ?? "";
      writeTxt(s, makeTxtLine(s, `ðŸ’¬ ${user}: ${comment}`, getCurrentDateTime));

      if (isHighlightedUser(user)) {
        event.highlight = true;
        writeHighlightJsonl(user, event);
      }
    }

    if (t === "gift") {
      const { giftName, repeatCount } = event.data || {};
      const user = event.user;
      const msg = `${user} ðŸŽ Gifted ${giftName} x${repeatCount}`;
      writeTxt(s, makeTxtLine(s, msg, getCurrentDateTime));

      if (isHighlightedUser(user)) {
        event.highlight = true;
        writeHighlightJsonl(user, event);
      }
    }

    if (t === "member") {
      const user = event.user;
      writeTxt(s, makeTxtLine(s, `${user} ðŸƒ Joined`, getCurrentDateTime));

      if (isHighlightedUser(user)) {
        event.highlight = true;
        writeHighlightJsonl(user, event);
      }
    }

    if (t === "follow") {
      const user = event.user ?? "unknown";
      writeTxt(s, makeTxtLine(s, `âž• FOLLOW: ${user}`, getCurrentDateTime));
      if (isHighlightedUser(user)) {
        event.highlight = true;
        writeHighlightJsonl(user, event);
      }
    }
    if (t === "share") {
      const user = event.user ?? "unknown";
      writeTxt(s, makeTxtLine(s, `ðŸ” SHARE: ${user}`, getCurrentDateTime));
      if (isHighlightedUser(user)) {
        event.highlight = true;
        writeHighlightJsonl(user, event);
      }
    }

    if (t === "like") {
      const user = event.user ?? "unknown";
      const likes = event.data?.likeCount ?? event.data?.totalLikeCount ?? event.data?.count ?? 1;
      writeTxt(s, makeTxtLine(s, `â¤ï¸ LIKE: ${user} x${likes}`, getCurrentDateTime));
      if (isHighlightedUser(user)) {
        event.highlight = true;
        writeHighlightJsonl(user, event);
      }
    }

    if (t === "roomUser") {
      const c = event.data?.viewerCount;
      if (typeof c === "number") writeTxt(s, makeTxtLine(s, `ðŸ‘€ Viewers: ${c}`, getCurrentDateTime));
    }

    if (t === "goalUpdate") {
      const id = event.data?.goalId ?? "-";
      const progress = event.data?.progress ?? "-";
      const target = event.data?.target ?? "-";
      writeTxt(s, makeTxtLine(s, `ðŸŽ¯ GOAL UPDATE: id=${id} ${progress}/${target}`, getCurrentDateTime));
    }

    if (t === "pollMessage") {
      const title = event.data?.pollTitle || "-";
      const state = event.data?.pollState || "update";
      const votes = event.data?.voters ?? "-";
      writeTxt(s, makeTxtLine(s, `ðŸ“Š POLL ${state}: ${title} (voters=${votes})`, getCurrentDateTime));
    }

    if (t === "linkMicBattle") {
      const battleId = event.data?.battleId || "-";
      const action = event.data?.action || "update";
      const score = event.data?.scoreSummary || "-";
      writeTxt(s, makeTxtLine(s, `âš”ï¸ LINK MIC BATTLE: id=${battleId} action=${action} score=${score}`, getCurrentDateTime));
    }

    if (t === "roomPin") {
      const action = event.data?.action || "pin_update";
      const ptype = event.data?.pinType || "-";
      const preview = event.data?.preview || "-";
      writeTxt(s, makeTxtLine(s, `ðŸ“Œ ROOM PIN (${action}/${ptype}): ${preview}`, getCurrentDateTime));
    }

    if (t === "quit") {
      const idleMs = Number(event.data?.idleMs ?? 0) || 0;
      const mins = Math.max(1, Math.round(idleMs / 60000));
      const user = event.user ?? "unknown";
      const lastType = event.data?.lastEventType || "-";
      writeTxt(s, makeTxtLine(s, `ðŸšª QUIT: ${user} (idle ~${mins}m, last=${lastType})`, getCurrentDateTime));
    }

    if (t === "alert") {
      const file = `${getTxtDir()}/${s} alerts.txt`;
      const a = event.data || {};
      const line = `[${getCurrentDateTime(timezone)}] [ALERT:${a.alertType}] user=${a.user ?? "-"} :: ${a.message ?? ""}\n`;
      writer.queue(file, line);
    }
  }

  function emitAlertFromChat({ streamer, user, comment }, { getCurrentDateTime }) {
    if (!alerts) return;
    const a = alerts.onChatEvent({ streamer, user, comment });
    if (!a) return;

    emit({
      ts: isoNow(),
      streamer,
      type: "alert",
      user,
      data: {
        alertType: a.type,
        user,
        message:
          a.type === "keyword"
            ? `Keyword "${a.keyword}" encontrada: ${comment}`
            : `PossÃ­vel spam: ${comment}`
      }
    }, { getCurrentDateTime });
  }

  function emitAlertFromGift({ streamer, user, giftName, repeatCount, diamonds, totalDiamonds }, { getCurrentDateTime }) {
    if (!alerts) return;
    const a = alerts.onGiftEvent({ streamer, user, giftName, repeatCount, diamonds, totalDiamonds });
    if (!a) return;

    const hasCoins = Number.isFinite(Number(a.totalDiamonds));
    const coinPart = hasCoins ? ` (${Number(a.totalDiamonds)} coins)` : "";
    const msg = `Gift ${a.giftName || "-"} x${a.repeatCount ?? 1}${coinPart}`;

    emit({
      ts: isoNow(),
      streamer,
      type: "alert",
      user,
      data: {
        alertType: "gift_custom",
        user,
        message: msg
      }
    }, { getCurrentDateTime });
  }

  return { emit, emitAlertFromChat, emitAlertFromGift };
}

