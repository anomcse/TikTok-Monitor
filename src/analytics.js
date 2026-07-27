function getDateParts(timezone, now = new Date()) {
  const dt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  return dt;
}

function getIsoWeekKey(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt - firstThursday) / 86400000 - 3) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function createPeriod(id, kind) {
  const EVENT_TOTALS_TEMPLATE = {
    chat: 0,
    gift: 0,
    member: 0,
    follow: 0,
    share: 0,
    like: 0,
    roomUser: 0,
    quit: 0,
    goalUpdate: 0,
    pollMessage: 0,
    linkMicBattle: 0,
    roomPin: 0
  };

  return {
    id,
    kind,
    streamers: {},
    eventTotals: { ...EVENT_TOTALS_TEMPLATE },
    anomalyTotals: {},
    startedAt: new Date().toISOString()
  };
}

function ensureStreamer(period, streamer) {
  if (!period.streamers[streamer]) {
    period.streamers[streamer] = {
      peakViewers: 0,
      peakMsgsPerMin: 0,
      totalSnapshots: 0,
      totals: {
        chat: 0,
        gift: 0,
        member: 0,
        follow: 0,
        share: 0,
        like: 0,
        roomUser: 0,
        quit: 0,
        goalUpdate: 0,
        pollMessage: 0,
        linkMicBattle: 0,
        roomPin: 0
      },
      lastSnapshotTs: null
    };
  }
  return period.streamers[streamer];
}

export function createAnalytics({
  timezone = "UTC",
  anomalyConfigProvider,
  onDailySummary,
  onWeeklySummary,
  onAnomaly
} = {}) {
  let currentDayKey = getDateParts(timezone);
  let currentWeekKey = getIsoWeekKey(currentDayKey);

  let daily = createPeriod(currentDayKey, "daily");
  let weekly = createPeriod(currentWeekKey, "weekly");

  const runtime = {};

  function getAnomalyConfig() {
    const fromProvider = typeof anomalyConfigProvider === "function" ? anomalyConfigProvider() : null;
    return {
      enabled: fromProvider?.enabled ?? true,
      minViewersForDrop: fromProvider?.minViewersForDrop ?? 30,
      viewersDropRatio: fromProvider?.viewersDropRatio ?? 0.6,
      msgsSpikeMultiplier: fromProvider?.msgsSpikeMultiplier ?? 2.5,
      msgsSpikeMinDelta: fromProvider?.msgsSpikeMinDelta ?? 25,
      highViewersSilenceThreshold: fromProvider?.highViewersSilenceThreshold ?? 80,
      highViewersSilenceStreak: fromProvider?.highViewersSilenceStreak ?? 3
    };
  }

  function rotateIfNeeded(now = new Date()) {
    const dayKey = getDateParts(timezone, now);
    const weekKey = getIsoWeekKey(dayKey);

    if (dayKey !== currentDayKey) {
      daily.endedAt = now.toISOString();
      if (typeof onDailySummary === "function") onDailySummary({ ...daily });
      currentDayKey = dayKey;
      daily = createPeriod(currentDayKey, "daily");
    }

    if (weekKey !== currentWeekKey) {
      weekly.endedAt = now.toISOString();
      if (typeof onWeeklySummary === "function") onWeeklySummary({ ...weekly });
      currentWeekKey = weekKey;
      weekly = createPeriod(currentWeekKey, "weekly");
    }
  }

  function recordEvent(streamer, type) {
    rotateIfNeeded();
    if (!streamer || !type) return;

    const stDay = ensureStreamer(daily, streamer);
    const stWeek = ensureStreamer(weekly, streamer);

    if (stDay.totals[type] != null) stDay.totals[type] += 1;
    if (stWeek.totals[type] != null) stWeek.totals[type] += 1;
    if (daily.eventTotals[type] != null) daily.eventTotals[type] += 1;
    if (weekly.eventTotals[type] != null) weekly.eventTotals[type] += 1;
  }

  function pushAnomaly(streamer, type, message, data = {}, severity = "warning") {
    daily.anomalyTotals[type] = (daily.anomalyTotals[type] || 0) + 1;
    weekly.anomalyTotals[type] = (weekly.anomalyTotals[type] || 0) + 1;

    if (typeof onAnomaly === "function") {
      onAnomaly({
        ts: new Date().toISOString(),
        streamer,
        type,
        severity,
        message,
        data
      });
    }
  }

  function recordSnapshot(streamer, snap) {
    rotateIfNeeded();
    if (!streamer || !snap) return;

    const stDay = ensureStreamer(daily, streamer);
    const stWeek = ensureStreamer(weekly, streamer);

    const viewersCurrent = Number(snap?.viewers?.current ?? 0) || 0;
    const msgsPerMin = Number(snap?.msgsPerMin ?? 0) || 0;

    stDay.peakViewers = Math.max(stDay.peakViewers, viewersCurrent);
    stWeek.peakViewers = Math.max(stWeek.peakViewers, viewersCurrent);
    stDay.peakMsgsPerMin = Math.max(stDay.peakMsgsPerMin, msgsPerMin);
    stWeek.peakMsgsPerMin = Math.max(stWeek.peakMsgsPerMin, msgsPerMin);
    stDay.totalSnapshots += 1;
    stWeek.totalSnapshots += 1;
    stDay.lastSnapshotTs = snap.ts || null;
    stWeek.lastSnapshotTs = snap.ts || null;

    const cfg = getAnomalyConfig();
    if (!cfg.enabled) return;

    if (!runtime[streamer]) {
      runtime[streamer] = { lastSnapshot: null, silenceHighViewersStreak: 0 };
    }
    const mem = runtime[streamer];
    const prev = mem.lastSnapshot;

    if (prev) {
      const prevViewers = Number(prev?.viewers?.current ?? 0) || 0;
      const prevMsgs = Number(prev?.msgsPerMin ?? 0) || 0;

      if (prevViewers >= cfg.minViewersForDrop) {
        const drop = prevViewers - viewersCurrent;
        const ratio = prevViewers > 0 ? drop / prevViewers : 0;
        if (ratio >= cfg.viewersDropRatio) {
          pushAnomaly(
            streamer,
            "viewers_drop",
            `Queda brusca de viewers: ${prevViewers} -> ${viewersCurrent}`,
            { prevViewers, viewersCurrent, ratio }
          );
        }
      }

      const deltaMsgs = msgsPerMin - prevMsgs;
      if (prevMsgs > 0 && deltaMsgs >= cfg.msgsSpikeMinDelta && msgsPerMin >= prevMsgs * cfg.msgsSpikeMultiplier) {
        pushAnomaly(
          streamer,
          "chat_spike",
          `Spike de chat: ${prevMsgs} -> ${msgsPerMin} msgs/min`,
          { prevMsgsPerMin: prevMsgs, msgsPerMin, delta: deltaMsgs }
        );
      }
    }

    if (viewersCurrent >= cfg.highViewersSilenceThreshold && msgsPerMin === 0) {
      mem.silenceHighViewersStreak += 1;
      if (mem.silenceHighViewersStreak >= cfg.highViewersSilenceStreak) {
        pushAnomaly(
          streamer,
          "silent_high_viewers",
          `Muitos viewers sem chat (${viewersCurrent} viewers, ${msgsPerMin} msgs/min)`,
          { viewersCurrent, msgsPerMin, streak: mem.silenceHighViewersStreak }
        );
        mem.silenceHighViewersStreak = 0;
      }
    } else {
      mem.silenceHighViewersStreak = 0;
    }

    mem.lastSnapshot = snap;
  }

  function getCurrentSummary() {
    return {
      day: { ...daily },
      week: { ...weekly }
    };
  }

  function flush() {
    const now = new Date().toISOString();
    daily.endedAt = now;
    weekly.endedAt = now;
    if (typeof onDailySummary === "function") onDailySummary({ ...daily, forced: true });
    if (typeof onWeeklySummary === "function") onWeeklySummary({ ...weekly, forced: true });
  }

  return {
    recordEvent,
    recordSnapshot,
    rotateIfNeeded,
    getCurrentSummary,
    flush
  };
}



