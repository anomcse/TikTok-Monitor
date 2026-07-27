let selectedStreamer = null;
let selectedDay = null;

const daySelect = document.getElementById("daySelect");
const refreshBtn = document.getElementById("refreshBtn");
const statusPill = document.getElementById("statusPill");
const globalStreamerSel = document.getElementById("globalStreamer");
const rangeSelect = document.getElementById("rangeSelect");
const adminTokenInput = document.getElementById("adminTokenInput");

const tabs = [...document.querySelectorAll(".tab")];
const views = {
  dashboard: document.getElementById("view-dashboard"),
  events: document.getElementById("view-events"),
  alerts: document.getElementById("view-alerts"),
  anomalies: document.getElementById("view-anomalies"),
  rankings: document.getElementById("view-rankings"),
  reports: document.getElementById("view-reports"),
  highlights: document.getElementById("view-highlights"),
  lists: document.getElementById("view-lists"),
};

const cardsEl = document.getElementById("cards");
const selectedStreamerEl = document.getElementById("selectedStreamer");

const mpmTitle = document.getElementById("mpmTitle");
const viewersTitle = document.getElementById("viewersTitle");
const mpmExtremaEl = document.getElementById("mpmExtrema");
const viewersExtremaEl = document.getElementById("viewersExtrema");
const topChatTitle = document.getElementById("topChatTitle");
const topGiftTitle = document.getElementById("topGiftTitle");
const totalsTitle = document.getElementById("totalsTitle");

const topChattersEl = document.getElementById("topChatters");
const topGiftersEl = document.getElementById("topGifters");
const totalsBox = document.getElementById("totalsBox");

const ctxMpm = document.getElementById("chartMpm");
const ctxViewers = document.getElementById("chartViewers");
const alertStreamerSel = document.getElementById("alertStreamer");
const alertIncludeSystem = document.getElementById("alertIncludeSystem");
const alertsRefreshBtn = document.getElementById("alertsRefreshBtn");
const alertsList = document.getElementById("alertsList");
const anomalyStreamerSel = document.getElementById("anomalyStreamer");
const anomaliesRefreshBtn = document.getElementById("anomaliesRefreshBtn");
const anomaliesList = document.getElementById("anomaliesList");
const topStatusEl = document.getElementById("topStatus");
const statusTableEl = document.getElementById("statusTable");
const statusActionsEl = document.getElementById("statusActions");


const eventStreamerSel = document.getElementById("eventStreamer");
const eventSearch = document.getElementById("eventSearch");
const eventsRefreshBtn = document.getElementById("eventsRefreshBtn");
const eventsPauseBtn = document.getElementById("eventsPauseBtn");
const eventsFollowBtn = document.getElementById("eventsFollowBtn");
const eventsInfoPill = document.getElementById("eventsInfoPill");
const eventsJoinedPill = document.getElementById("eventsJoinedPill");
const eventsQuitPill = document.getElementById("eventsQuitPill");
const eventsNetPill = document.getElementById("eventsNetPill");
const eventsList = document.getElementById("eventsList");

const evChat = document.getElementById("evChat");
const evGift = document.getElementById("evGift");
const evFollow = document.getElementById("evFollow");
const evShare = document.getElementById("evShare");
const evMember = document.getElementById("evMember");
const evRoomUser = document.getElementById("evRoomUser");
const evLike = document.getElementById("evLike");
const evQuit = document.getElementById("evQuit");

const rkPeakViewers = document.getElementById("rkPeakViewers");
const rkCurrentViewers = document.getElementById("rkCurrentViewers");
const rkMsgsPerMin = document.getElementById("rkMsgsPerMin");
const rkTotalChats = document.getElementById("rkTotalChats");
const rkTotalGifts = document.getElementById("rkTotalGifts");
const rkGlobalChatters = document.getElementById("rkGlobalChatters");
const rkGlobalGifters = document.getElementById("rkGlobalGifters");

const hlUserSel = document.getElementById("hlUser");
const hlStreamerSel = document.getElementById("hlStreamer");
const hlTypesSel = document.getElementById("hlTypes");
const hlSearch = document.getElementById("hlSearch");
const hlRefreshBtn = document.getElementById("hlRefreshBtn");
const hlInfoPill = document.getElementById("hlInfoPill");
const hlList = document.getElementById("hlList");

const reportStreamerSel = document.getElementById("reportStreamer");
const reportSearch = document.getElementById("reportSearch");
const reportLimit = document.getElementById("reportLimit");
const reportPreviewBtn = document.getElementById("reportPreviewBtn");
const reportDownloadBtn = document.getElementById("reportDownloadBtn");
const reportModeBtn = document.getElementById("reportModeBtn");
const reportInfoPill = document.getElementById("reportInfoPill");
const reportPreview = document.getElementById("reportPreview");
const rpChat = document.getElementById("rpChat");
const rpGift = document.getElementById("rpGift");
const rpMember = document.getElementById("rpMember");
const rpFollow = document.getElementById("rpFollow");
const rpShare = document.getElementById("rpShare");
const rpRoomUser = document.getElementById("rpRoomUser");
const rpGoalUpdate = document.getElementById("rpGoalUpdate");
const rpPollMessage = document.getElementById("rpPollMessage");
const rpLinkMicBattle = document.getElementById("rpLinkMicBattle");
const rpRoomPin = document.getElementById("rpRoomPin");
const rpQuit = document.getElementById("rpQuit");

let chartMpm = null;
let chartViewers = null;
let sse = null;

let activeTab = "dashboard";
let alertsTimer = null;
let rankingsTimer = null;
let eventsTimer = null;
let highlightsTimer = null;
let listsTimer = null;
let anomaliesTimer = null;

const streamersEditor = document.getElementById("streamersEditor");
const highlightUsersEditor = document.getElementById("highlightUsersEditor");
const streamersReloadBtn = document.getElementById("streamersReloadBtn");
const streamersSaveBtn = document.getElementById("streamersSaveBtn");
const streamersCleanBtn = document.getElementById("streamersCleanBtn");
const highlightUsersReloadBtn = document.getElementById("highlightUsersReloadBtn");
const highlightUsersSaveBtn = document.getElementById("highlightUsersSaveBtn");
const highlightUsersCleanBtn = document.getElementById("highlightUsersCleanBtn");
const streamersInfo = document.getElementById("streamersInfo");
const highlightUsersInfo = document.getElementById("highlightUsersInfo");
const streamerAddInput = document.getElementById("streamerAddInput");
const streamerAddBtn = document.getElementById("streamerAddBtn");
const highlightAddInput = document.getElementById("highlightAddInput");
const highlightAddBtn = document.getElementById("highlightAddBtn");
const streamersWarnings = document.getElementById("streamersWarnings");
const highlightUsersWarnings = document.getElementById("highlightUsersWarnings");

let eventsPaused = false;
let eventsFollow = true;
let lastRenderedEventTs = null;
let pendingNewCount = 0;
let lastCardsSignature = "";
let cardsIntroDone = false;
let forceInitialChartZoom = false;
let rankingsLoading = false;
let latestStatusSnapshot = { streamers: {} };
let eventsLoadSeq = 0;
let rankingsLoadSeq = 0;
let detailsLoadSeq = 0;
let reportRenderMode = "compact";
let generatedReportPages = [];
let eventsTotalLikesSnapshot = { at: 0, event: null };
let eventsTotalLikesHistory = [];
let eventsTotalLikesLast = { key: "", value: null };
let eventsTotalLikesSeedNeeded = true;
let eventsJoinQuitCache = { key: "", at: 0, data: null };
const streamerWasOnline = new Map();
const EVENTS_FETCH_LIMIT = 2000;
const EVENTS_TOTAL_LIKES_INTERVAL_MS = 10_000;
const TIKTOK_CYAN = getComputedStyle(document.documentElement).getPropertyValue("--tiktok-cyan").trim() || "#24f6fa";
const TIKTOK_PINK = getComputedStyle(document.documentElement).getPropertyValue("--tiktok-pink").trim() || "#fd2854";
const TIKTOK_WHITE = getComputedStyle(document.documentElement).getPropertyValue("--white").trim() || "#ffffff";

const INITIAL_ZOOM_WINDOW_RATIO = 0.204;
const INITIAL_ZOOM_MIN_POINTS = 60;
const DATASET_MAIN = 0;
const DATASET_PEAK = 1;
const DATASET_VALLEY = 2;

const EVENT_TYPE_META = {
  chat: { key: "chat", emoji: "\u{1F4AC}", label: "chat" },
  gift: { key: "gift", emoji: "\u{1F381}", label: "gift" },
  follow: { key: "follow", emoji: "\u2795", label: "followed" },
  share: { key: "share", emoji: "\u{1F501}", label: "shared" },
  member: { key: "member", emoji: "\u{1F9E9}", label: "joined" },
  roomUser: { key: "roomUser", emoji: "\u{1F440}", label: "viewers" },
  like: { key: "like", emoji: "\u2764\uFE0F", label: "likes" },
  likeTotal: { key: "like", emoji: "\u{1F4C8}", label: "total likes" },
  quit: { key: "quit", emoji: "\u{1F6AA}", label: "quit (idle)" },
  goalUpdate: { key: "system", emoji: "\u{1F3AF}", label: "goal update" },
  pollMessage: { key: "system", emoji: "\u{1F4CA}", label: "poll" },
  linkMicBattle: { key: "system", emoji: "\u2694\uFE0F", label: "link mic battle" },
  roomPin: { key: "system", emoji: "\u{1F4CC}", label: "room pin" },
  streamEnd: { key: "system", emoji: "\u26D4", label: "stream ended" },
  connected: { key: "system", emoji: "\u{1F7E2}", label: "connected" },
  disconnected: { key: "system", emoji: "\u{1F50C}", label: "disconnected" },
  error: { key: "alert", emoji: "\u274C", label: "error" },
  alert: { key: "alert", emoji: "\u{1F6A8}", label: "alert" },
  snapshot: { key: "system", emoji: "\u{1F4F8}", label: "snapshot" },
  offline: { key: "system", emoji: "\u{1F319}", label: "offline" },
  system: { key: "system", emoji: "\u2699\uFE0F", label: "system" }
};
const RANKING_META = {
  peak: { key: "peak", emoji: "\u{1F451}" },
  current: { key: "current", emoji: "\u{1F440}" },
  mpm: { key: "mpm", emoji: "\u26A1" },
  chat: { key: "chat", emoji: "\u{1F4AC}" },
  gift: { key: "gift", emoji: "\u{1F381}" },
  chatters: { key: "chatters", emoji: "\u{1F5E8}\uFE0F" },
  gifters: { key: "gifters", emoji: "\u{1F381}" },
  default: { key: "current", emoji: "\u{1F4CA}" }
};

function getEventTypeMeta(type) {
  return EVENT_TYPE_META[type] || { key: "system", emoji: "\u{1F4CC}", label: type || "-" };
}

function getRankingMeta(kind) {
  return RANKING_META[kind] || RANKING_META.default;
}

function normalizeRuntimeState(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "online" || s === "probing" || s === "paused" || s === "offline") return s;
  return "offline";
}

function runtimeStateForStreamer(streamer, fallbackOnline = false) {
  const info = latestStatusSnapshot?.streamers?.[streamer] || null;
  const state = normalizeRuntimeState(info?.status);
  if (!info) return fallbackOnline ? "online" : "offline";
  return state;
}

function runtimeStateText(state) {
  if (state === "online") return "ONLINE";
  if (state === "probing") return "PROBING";
  if (state === "paused") return "PAUSED";
  return "OFFLINE";
}

function setPill(text) {
  if (statusPill) statusPill.textContent = text;
}

function fmtTs(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function tsToMs(ts) {
  const t = new Date(ts || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function eventKey(e) {
  if (!e || typeof e !== "object") return "ev:unknown";
  return [
    e.ts || "",
    e.streamer || "",
    e.type || "",
    e.user || "",
    e.message || ""
  ].join("|");
}

function fmtList(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return list.map(([u, c]) => ({ u, c }));
}

function renderTop(el, list) {
  el.innerHTML = "";
  const rows = fmtList(list);
  if (!rows.length) {
    el.innerHTML = `<div class="muted">-</div>`;
    return;
  }
  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "itemLine";
    div.innerHTML = `<span>${r.u}</span><span>${r.c}</span>`;
    el.appendChild(div);
  }
}

function buildCard(item, orderIndex, withIntro = false) {
  const card = document.createElement("div");
  card.className = "card";
  if (withIntro) card.classList.add("intro");
  if (item.streamer === selectedStreamer) card.classList.add("selected");

  const state = item.runtimeState || runtimeStateForStreamer(item.streamer, !!item.online);
  const badgeClass = state;
  const badgeText = runtimeStateText(state);

  const topChat =
    (item.topChatters || [])
      .slice(0, 3)
      .map((x) => `${x[0]}(${x[1]})`)
      .join(", ") || "-";
  const topGift =
    (item.topGifters || [])
      .slice(0, 3)
      .map((x) => `${x[0]}(${x[1]})`)
      .join(", ") || "-";

  card.innerHTML = `
    <div class="row">
      <div class="nameWrap"><span class="openOrder">#${orderIndex}</span><div class="name">${item.streamer}</div></div>
      <div class="badge ${badgeClass}">${badgeText}</div>
    </div>
    <div class="meta">
      <div><b>${fmtTs(item.lastTs)}</b></div>
      <div><span class="metricTag metric-chat">\u26A1 msgs/min</span>: <b>${item.msgsPerMin ?? 0}</b> | <span class="metricTag metric-viewers">\u{1F440} viewers</span>: <b>${item.viewers?.current ?? "-"}</b></div>
      <div><span class="metricTag metric-chat">\u{1F5E8}\uFE0F top chat</span>: <b>${topChat}</b></div>
      <div><span class="metricTag metric-gift">\u{1F381} top gift</span>: <b>${topGift}</b></div>
    </div>
  `;

  card.addEventListener("click", async () => {
    selectedStreamer = item.streamer;
    forceInitialChartZoom = true;
    selectedStreamerEl.textContent = `(${selectedStreamer})`;
    renderCards(window.__lastSummary || { streamers: [] });
    await loadStreamerDetails();
  });

  return card;
}

function rebuildSelect(sel, values, keepValue = "all") {
  const prev = sel.value || keepValue;
  sel.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v === "all" ? "(all)" : v;
    sel.appendChild(opt);
  }
  sel.value = values.includes(prev) ? prev : keepValue;
}

function syncSelectOptions(sel, values, keepValue = "all") {
  if (!sel) return;
  const current = [...sel.options].map((o) => o.value);
  const same =
    current.length === values.length &&
    current.every((v, i) => v === values[i]);
  if (same) {
    const prev = sel.value || keepValue;
    sel.value = values.includes(prev) ? prev : keepValue;
    return;
  }
  rebuildSelect(sel, values, keepValue);
}

function renderCards(summary) {
  window.__lastSummary = summary;

  const streamers = (summary.streamers || []).map((s) => s.streamer);
  syncSelectOptions(alertStreamerSel, ["all", ...streamers], "all");
  syncSelectOptions(eventStreamerSel, ["all", ...streamers], "all");
  syncSelectOptions(anomalyStreamerSel, ["all", ...streamers], "all");
  syncSelectOptions(reportStreamerSel, ["all", ...streamers], "all");
  syncSelectOptions(globalStreamerSel, ["all", ...streamers], "all");

  const prevTop = cardsEl.scrollTop;
  const globalStreamer = getGlobalStreamer();
  const list = (summary.streamers || [])
    .filter((s) => globalStreamer === "all" || s.streamer === globalStreamer)
    .map((s) => {
      const runtimeState = runtimeStateForStreamer(s.streamer, !!s.online);
      const online = runtimeState === "online" || runtimeState === "probing";
      const statusInfo = latestStatusSnapshot?.streamers?.[s.streamer] || null;
      const onlineSince = Number(statusInfo?.onlineSince || 0);
      const liveOpenedAt = onlineSince > 0 ? onlineSince : s.liveOpenedAt;
      return { ...s, runtimeState, online, liveOpenedAt };
    })
    .sort((a, b) => {
      const aOnline = a.runtimeState === "online" || a.runtimeState === "probing";
      const bOnline = b.runtimeState === "online" || b.runtimeState === "probing";
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      if (aOnline && bOnline) {
        const aOpen = Number(a.liveOpenedAt || 0);
        const bOpen = Number(b.liveOpenedAt || 0);
        if (aOpen !== bOpen) return aOpen - bOpen;
      }
      return (b.msgsPerMin ?? 0) - (a.msgsPerMin ?? 0);
    });
  const signature = JSON.stringify({
    globalStreamer,
    selectedStreamer,
    list: list.map((s) => [s.streamer, s.runtimeState || "offline", !!s.online, s.liveOpenedAt ?? null, s.lastTs || "", s.msgsPerMin ?? 0, s?.viewers?.current ?? null])
  });
  if (signature === lastCardsSignature) return;
  lastCardsSignature = signature;

  cardsEl.innerHTML = "";

  if (!list.length) {
    cardsEl.innerHTML = `<div class="muted">No snapshots found for this day.</div>`;
    renderStatusTable([]);
    return;
  }
  renderStatusTable(list);
  const withIntro = !cardsIntroDone;
  list.forEach((item, idx) => cardsEl.appendChild(buildCard(item, idx + 1, withIntro)));
  cardsIntroDone = true;
  cardsEl.scrollTop = prevTop;
}

async function sendAdminAction(action, streamer) {
  const data = await fetchJSONWithOptions("/api/admin/action", {
    method: "POST",
    headers: { "content-type": "application/json", ...getAdminHeaders() },
    body: JSON.stringify({ action, streamer }),
  });
  return data;
}

function buildActionButton(label, action, streamer) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    try {
      const target = action === "clear_circuit_all" ? "" : streamer;
      await sendAdminAction(action, target);
      setPill(`action queued: ${action} @${streamer}`);
      await refreshTopStatus();
    } catch (err) {
      setPill("admin action failed");
      console.error(err);
    }
  });
  return btn;
}

function renderStatusTable(items) {
  if (!statusTableEl || !statusActionsEl) return;
  statusTableEl.innerHTML = "";
  statusActionsEl.innerHTML = "";

  const globalStreamer = getGlobalStreamer();
  if (globalStreamer !== "all") {
    const row = document.createElement("div");
    row.className = "rowControls";
    row.appendChild(buildActionButton("Pause", "pause", globalStreamer));
    row.appendChild(buildActionButton("Resume", "resume", globalStreamer));
    row.appendChild(buildActionButton("Reconnect", "reconnect", globalStreamer));
    row.appendChild(buildActionButton("Clear Circuit", "clear_circuit", globalStreamer));
    statusActionsEl.appendChild(row);
  } else {
    const row = document.createElement("div");
    row.className = "rowControls";
    row.appendChild(buildActionButton("Clear All Circuits", "clear_circuit_all", "all"));
    statusActionsEl.appendChild(row);
  }

  const header = document.createElement("div");
  header.className = "tableRow header statusRow";
  header.innerHTML = "<div>Streamer</div><div>State</div><div>Msgs/min</div><div>Viewers</div><div>Last Update</div>";
  statusTableEl.appendChild(header);

  if (!items.length) {
    const row = document.createElement("div");
    row.className = "tableRow statusRow";
    row.innerHTML = "<div>-</div><div>-</div><div>-</div><div>-</div><div>-</div>";
    statusTableEl.appendChild(row);
    return;
  }

  for (const it of items) {
    const state = it.runtimeState || runtimeStateForStreamer(it.streamer, !!it.online);
    const stateLabel =
      state === "online" ? "online" :
      state === "probing" ? "probing" :
      state === "paused" ? "paused" :
      "offline";
    const row = document.createElement("div");
    row.className = "tableRow statusRow";
    row.innerHTML = `<div>${it.streamer || "-"}</div><div>${stateLabel}</div><div>${it.msgsPerMin ?? 0}</div><div>${it.viewers?.current ?? "-"}</div><div>${fmtTs(it.lastTs)}</div>`;
    statusTableEl.appendChild(row);
  }
}

function destroyCharts() {
  if (chartMpm) chartMpm.destroy();
  if (chartViewers) chartViewers.destroy();
  chartMpm = null;
  chartViewers = null;
}

function getExtremaTargetForChart(chart) {
  if (!chart?.canvas?.id) return null;
  if (chart.canvas.id === "chartMpm") return mpmExtremaEl;
  if (chart.canvas.id === "chartViewers") return viewersExtremaEl;
  return null;
}

function fmtMetricValue(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "-";
}

function normalizeIndexRange(minValue, maxValue, length) {
  if (length <= 0) return { start: 0, end: -1 };
  const start = Math.max(0, Math.min(length - 1, Math.floor(Number(minValue ?? 0))));
  const end = Math.max(start, Math.min(length - 1, Math.ceil(Number(maxValue ?? (length - 1)))));
  return { start, end };
}

function computeExtrema(values, start, end) {
  if (!Array.isArray(values) || start > end) return null;
  let peakValue = -Infinity;
  let valleyValue = Infinity;
  let peakIndex = -1;
  let valleyIndex = -1;

  for (let i = start; i <= end; i += 1) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) continue;
    if (v > peakValue) {
      peakValue = v;
      peakIndex = i;
    }
    if (v < valleyValue) {
      valleyValue = v;
      valleyIndex = i;
    }
  }

  if (peakIndex < 0 || valleyIndex < 0) return null;
  return { peakIndex, peakValue, valleyIndex, valleyValue };
}

function createMarkerData(length, index, value) {
  const arr = new Array(length).fill(null);
  if (index >= 0 && index < length) arr[index] = value;
  return arr;
}

function renderExtremaSummary(chart, extrema) {
  const target = getExtremaTargetForChart(chart);
  if (!target) return;
  if (!extrema) {
    target.innerHTML = "Max.: - | Min.: -";
    return;
  }
  const labels = chart.data?.labels || [];
  const peakTime = labels[extrema.peakIndex] || "-";
  const valleyTime = labels[extrema.valleyIndex] || "-";
  target.innerHTML = `<span class="extremaPeak">Max.: ${fmtMetricValue(extrema.peakValue)} (${peakTime})</span> | <span class="extremaValley">Min.: ${fmtMetricValue(extrema.valleyValue)} (${valleyTime})</span>`;
}

function applyExtremaOverlay(chart, shouldUpdate = false) {
  if (!chart || !Array.isArray(chart.data?.datasets) || !chart.data.datasets[DATASET_MAIN]) return;

  const labels = chart.data.labels || [];
  const values = chart.data.datasets[DATASET_MAIN].data || [];
  const scaleX = chart.scales?.x;
  const { start, end } = normalizeIndexRange(scaleX?.min, scaleX?.max, labels.length);
  const extrema = computeExtrema(values, start, end);

  if (chart.data.datasets[DATASET_PEAK]) {
    chart.data.datasets[DATASET_PEAK].data = extrema
      ? createMarkerData(labels.length, extrema.peakIndex, extrema.peakValue)
      : new Array(labels.length).fill(null);
  }
  if (chart.data.datasets[DATASET_VALLEY]) {
    chart.data.datasets[DATASET_VALLEY].data = extrema
      ? createMarkerData(labels.length, extrema.valleyIndex, extrema.valleyValue)
      : new Array(labels.length).fill(null);
  }
  renderExtremaSummary(chart, extrema);

  if (shouldUpdate) chart.update("none");
}

function buildLineChart(canvas, labels, values, seriesLabel) {
  const maxXIndex = Math.max(0, labels.length - 1);
  const minRange = Math.max(20, Math.min(120, Math.floor(labels.length * 0.02)));
  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: seriesLabel,
          data: values,
          borderColor: TIKTOK_CYAN,
          backgroundColor: "rgba(36,246,250,0.22)",
          pointBackgroundColor: TIKTOK_CYAN,
          pointBorderColor: TIKTOK_CYAN,
        },
        {
          label: "max",
          data: new Array(labels.length).fill(null),
          showLine: false,
          borderColor: TIKTOK_CYAN,
          backgroundColor: TIKTOK_CYAN,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHitRadius: 12,
          pointBackgroundColor: TIKTOK_CYAN,
          pointBorderColor: TIKTOK_WHITE,
          pointBorderWidth: 1.5,
        },
        {
          label: "min",
          data: new Array(labels.length).fill(null),
          showLine: false,
          borderColor: TIKTOK_PINK,
          backgroundColor: TIKTOK_PINK,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointHitRadius: 12,
          pointBackgroundColor: TIKTOK_PINK,
          pointBorderColor: TIKTOK_WHITE,
          pointBorderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      elements: {
        line: { borderWidth: 1.5, tension: 0.15 },
        point: { radius: 1.6, hitRadius: 6 },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 14, autoSkip: true },
          grid: { display: false },
        },
      },
      plugins: {
        decimation: {
          enabled: values.length > 400,
          algorithm: "lttb",
          samples: 220,
        },
        zoom: {
          limits: { x: { min: 0, max: maxXIndex, minRange } },
          pan: { enabled: true, mode: "x" },
          onPanComplete: ({ chart }) => applyExtremaOverlay(chart, true),
          zoom: {
            mode: "x",
            wheel: { enabled: true },
            pinch: { enabled: true },
            drag: { enabled: false },
          },
          onZoomComplete: ({ chart }) => applyExtremaOverlay(chart, true),
        },
      },
    },
  });
}

function applyInitialZoomWindow(chart, pointCount) {
  if (!chart || pointCount <= 0) return;
  if (!chart.options.scales) chart.options.scales = {};
  if (!chart.options.scales.x) chart.options.scales.x = {};

  if (pointCount < INITIAL_ZOOM_MIN_POINTS) {
    delete chart.options.scales.x.min;
    delete chart.options.scales.x.max;
    chart.update("none");
    return;
  }

  const windowSize = Math.max(20, Math.floor(pointCount * INITIAL_ZOOM_WINDOW_RATIO));
  const max = pointCount - 1;
  const min = Math.max(0, max - windowSize + 1);
  chart.options.scales.x.min = min;
  chart.options.scales.x.max = max;
  chart.update("none");
}

function updateLineChart(chart, labels, values) {
  const prevCount = Array.isArray(chart.data?.labels) ? chart.data.labels.length : 0;
  const prevFullMax = Math.max(0, prevCount - 1);
  const prevScale = chart.scales?.x;
  const prevMin = Number(prevScale?.min ?? 0);
  const prevMax = Number(prevScale?.max ?? prevFullMax);
  const wasZoomed = !!prevScale && (prevMin > 0 || prevMax < prevFullMax);
  const nearRightEdge = wasZoomed && (prevFullMax - prevMax) <= 2;

  chart.data.labels = labels;
  if (Array.isArray(chart.data?.datasets) && chart.data.datasets[0]) {
    chart.data.datasets[DATASET_MAIN].data = values;
  }

  const nextFullMax = Math.max(0, labels.length - 1);
  const nextMinRange = Math.max(20, Math.min(120, Math.floor(labels.length * 0.02)));
  const zoomLimits = chart.options?.plugins?.zoom?.limits?.x;
  if (zoomLimits) {
    zoomLimits.max = nextFullMax;
    zoomLimits.minRange = nextMinRange;
  }

  if (!chart.options.scales) chart.options.scales = {};
  if (!chart.options.scales.x) chart.options.scales.x = {};

  if (wasZoomed && nextFullMax > 0) {
    const windowSize = Math.max(1, prevMax - prevMin);
    const deltaCount = Math.max(0, labels.length - prevCount);
    let nextMin = Math.max(0, prevMin);

    // If user is zoomed near "now", keep the window following new samples.
    if (nearRightEdge && deltaCount > 0) {
      nextMin = Math.max(0, prevMin + deltaCount);
    }

    nextMin = Math.min(nextFullMax - 1, nextMin);
    const nextMax = Math.min(nextFullMax, Math.max(nextMin + 1, nextMin + windowSize));
    chart.options.scales.x.min = nextMin;
    chart.options.scales.x.max = nextMax;
  } else {
    delete chart.options.scales.x.min;
    delete chart.options.scales.x.max;
  }

  applyExtremaOverlay(chart);
  chart.update("none");
}

function renderCharts(series) {
  const points = (series.ts || []).map((t, i) => ({
    ts: t,
    msgsPerMin: (series.msgsPerMin || [])[i] ?? 0,
    viewers: (series.viewers || [])[i] ?? 0,
  }));
  const hours = getRangeHours();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const filtered = points.filter((p) => tsToMs(p.ts) >= cutoff);
  const dataPoints = filtered.length ? filtered : points;

  const labels = dataPoints.map((p) => {
    const t = p.ts;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR");
  });

  const mpmValues = dataPoints.map((p) => p.msgsPerMin);
  const viewersValues = dataPoints.map((p) => p.viewers);

  if (!chartMpm) {
    chartMpm = buildLineChart(ctxMpm, labels, mpmValues, "msgs/min");
    applyExtremaOverlay(chartMpm, true);
  } else updateLineChart(chartMpm, labels, mpmValues);

  if (!chartViewers) {
    chartViewers = buildLineChart(ctxViewers, labels, viewersValues, "viewers");
    applyExtremaOverlay(chartViewers, true);
  } else updateLineChart(chartViewers, labels, viewersValues);

  if (forceInitialChartZoom) {
    applyInitialZoomWindow(chartMpm, labels.length);
    applyInitialZoomWindow(chartViewers, labels.length);
    applyExtremaOverlay(chartMpm, true);
    applyExtremaOverlay(chartViewers, true);
    forceInitialChartZoom = false;
  }
}

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function fetchJSONWithOptions(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function getAdminHeaders() {
  const token = String(adminTokenInput?.value || "").trim();
  return token ? { "x-admin-token": token } : {};
}

function getGlobalStreamer() {
  return globalStreamerSel?.value || "all";
}

function getRangeHours() {
  const value = String(rangeSelect?.value || "24h").trim();
  const n = Number(value.replace("h", ""));
  return Number.isFinite(n) && n > 0 ? n : 24;
}

function stopTimers() {
  if (alertsTimer) clearInterval(alertsTimer);
  if (rankingsTimer) clearInterval(rankingsTimer);
  if (eventsTimer) clearInterval(eventsTimer);
  if (highlightsTimer) clearInterval(highlightsTimer);
  if (listsTimer) clearInterval(listsTimer);
  if (anomaliesTimer) clearInterval(anomaliesTimer);
  alertsTimer = rankingsTimer = eventsTimer = highlightsTimer = listsTimer = anomaliesTimer = null;
}

function setTab(tabName) {
  activeTab = tabName;

  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("hidden", k !== tabName));

  stopTimers();

  if (tabName === "alerts") {
    loadAlerts().catch(() => {});
    alertsTimer = setInterval(() => activeTab === "alerts" && loadAlerts().catch(() => {}), 5000);
  }
  if (tabName === "anomalies") {
    loadAnomalies().catch(() => {});
    anomaliesTimer = setInterval(() => activeTab === "anomalies" && loadAnomalies().catch(() => {}), 5000);
  }

  if (tabName === "rankings") {
    loadRankings().catch(() => {});
    rankingsTimer = setInterval(() => activeTab === "rankings" && loadRankings().catch(() => {}), 2_000);
  }

  if (tabName === "events") {
    loadEvents().catch(() => {});
    eventsTimer = setInterval(() => activeTab === "events" && loadEvents().catch(() => {}), 1_800);
  }

  if (tabName === "reports") {
    if (reportInfoPill) reportInfoPill.textContent = "selecione filtros e clique em gerar";
  }

  if (tabName === "highlights") {
    loadHighlights().catch(() => {});
    highlightsTimer = setInterval(() => activeTab === "highlights" && loadHighlights().catch(() => {}), 4000);
  }

  if (tabName === "lists") {
    loadLists().catch(() => {});
    listsTimer = setInterval(() => activeTab === "lists" && loadLists({ keepLocalIfDirty: true }).catch(() => {}), 7000);
  }
}

tabs.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

async function loadDays() {
  setPill("loading days...");
  const data = await fetchJSON("/api/days");

  daySelect.innerHTML = "";
  const days = data.days || [];
  for (const d of days) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    daySelect.appendChild(opt);
  }

  selectedDay = data.defaultDay || days[0] || null;
  if (selectedDay) daySelect.value = selectedDay;
  setPill(selectedDay ? "ok" : "no days");
}

async function loadSummary() {
  if (!selectedDay) return;
  setPill("updating...");
  const summary = await fetchJSON(`/api/summary?day=${encodeURIComponent(selectedDay)}`);
  renderCards(summary);
  setPill("live");
}

async function loadStreamerDetails() {
  if (!selectedDay || !selectedStreamer) return;

  const seq = ++detailsLoadSeq;
  const target = selectedStreamer;
  let data;
  try {
    data = await fetchJSON(
      `/api/streamer?day=${encodeURIComponent(selectedDay)}&streamer=${encodeURIComponent(target)}`
    );
  } catch {
    if (seq !== detailsLoadSeq || target !== selectedStreamer) return;
    mpmTitle.textContent = `\u26A1 Msgs/min (${target})`;
    viewersTitle.textContent = `\u{1F440} Viewers (${target})`;
    topChatTitle.textContent = `\u{1F5E8}\uFE0F Top chatters (${target})`;
    topGiftTitle.textContent = `\u{1F381} Top gifters (${target})`;
    totalsTitle.textContent = `Totals (${target})`;
    renderCharts({ ts: [], msgsPerMin: [], viewers: [] });
    topChattersEl.innerHTML = `<div class="muted">-</div>`;
    topGiftersEl.innerHTML = `<div class="muted">-</div>`;
    totalsBox.textContent = "";
    return;
  }
  if (seq !== detailsLoadSeq || target !== selectedStreamer) return;

  mpmTitle.textContent = `\u26A1 Msgs/min (${target})`;
  viewersTitle.textContent = `\u{1F440} Viewers (${target})`;
  topChatTitle.textContent = `\u{1F5E8}\uFE0F Top chatters (${target})`;
  topGiftTitle.textContent = `\u{1F381} Top gifters (${target})`;
  totalsTitle.textContent = `Totals (${target})`;

  renderCharts(data.series || { ts: [], msgsPerMin: [], viewers: [] });

  const last = data.last || null;
  if (last) {
    renderTop(topChattersEl, last.topChatters || []);
    renderTop(topGiftersEl, last.topGifters || []);

    const t = { ...(last.totals || {}) };
    delete t.member;
    delete t.roomUser;

    totalsBox.textContent = JSON.stringify(t, null, 2);
  } else {
    topChattersEl.innerHTML = `<div class="muted">-</div>`;
    topGiftersEl.innerHTML = `<div class="muted">-</div>`;
    totalsBox.textContent = "";
  }
}

function renderAlerts(alerts) {
  alertsList.innerHTML = "";

  const header = document.createElement("div");
  header.className = "tableRow header alert";
  header.innerHTML = `<div class="col-when">When</div><div class="col-streamer">Streamer</div><div class="col-type">Type</div><div class="col-message">Message</div>`;
  alertsList.appendChild(header);

  if (!alerts.length) {
    const row = document.createElement("div");
    row.className = "tableRow alert";
    row.innerHTML = `<div class="col-when cellStrong">-</div><div class="col-streamer">-</div><div class="col-type">-</div><div class="col-message">No alerts (in tail).</div>`;
    alertsList.appendChild(row);
    return;
  }

  for (const a of alerts) {
    const meta = getEventTypeMeta(a.type);
    const rep = a.repeats ? ` <span class="muted">(repeated ${a.repeats}x)</span>` : "";
    const row = document.createElement("div");
    row.className = `tableRow alert evt-${meta.key}`;
    row.innerHTML = `
      <div class="col-when cellStrong">${fmtTs(a.ts)}</div>
      <div class="col-streamer">${a.streamer || "-"}</div>
      <div class="col-type"><span class="typeTag evt-${meta.key}">${meta.emoji} ${typeLabel(a.type)}</span></div>
      <div class="col-message">${(a.message || "-")}${rep}</div>
    `;
    alertsList.appendChild(row);
  }
}

async function loadAlerts() {
  if (!selectedDay) return;
  const streamer = getGlobalStreamer() !== "all" ? getGlobalStreamer() : (alertStreamerSel.value || "all");
  const includeSystem = alertIncludeSystem.checked ? "1" : "0";

  setPill("alerts...");
  const data = await fetchJSON(
    `/api/alerts?day=${encodeURIComponent(selectedDay)}&streamer=${encodeURIComponent(streamer)}&includeSystem=${includeSystem}&limit=150`
  );
  renderAlerts(data.alerts || []);
  setPill("live");
}

function renderAnomalies(items) {
  anomaliesList.innerHTML = "";

  const header = document.createElement("div");
  header.className = "tableRow header anomaly";
  header.innerHTML = "<div>When</div><div>Streamer</div><div>Type</div><div>Message</div>";
  anomaliesList.appendChild(header);

  if (!items.length) {
    const row = document.createElement("div");
    row.className = "tableRow anomaly";
    row.innerHTML = "<div>-</div><div>-</div><div>-</div><div>No anomalies found.</div>";
    anomaliesList.appendChild(row);
    return;
  }

  for (const a of items) {
    const row = document.createElement("div");
    row.className = "tableRow anomaly";
    row.innerHTML = `<div class="cellStrong">${fmtTs(a.ts)}</div><div>${a.streamer || "-"}</div><div>${a.type || "-"}</div><div>${a.message || "-"}</div>`;
    anomaliesList.appendChild(row);
  }
}

async function loadAnomalies() {
  if (!selectedDay) return;
  const streamer = getGlobalStreamer() !== "all" ? getGlobalStreamer() : (anomalyStreamerSel.value || "all");
  setPill("anomalies...");
  const data = await fetchJSON(
    `/api/anomalies?day=${encodeURIComponent(selectedDay)}&streamer=${encodeURIComponent(streamer)}&limit=220`
  );
  renderAnomalies(data.anomalies || []);
  setPill("live");
}

function getSelectedEventTypes() {
  const types = [];
  if (evChat.checked) types.push("chat");
  if (evGift.checked) types.push("gift");
  if (evFollow.checked) types.push("follow");
  if (evShare.checked) types.push("share");
  if (evMember.checked) types.push("member");
  if (evRoomUser.checked) types.push("roomUser");
  if (evLike.checked) types.push("like");
  if (evQuit?.checked) types.push("quit");
  return types.length ? types.join(",") : "all";
}

function updateEventsInfoPill() {
  const mode = eventsPaused ? "PAUSED" : "LIVE";
  const follow = eventsFollow ? "auto-scroll: ON" : "auto-scroll: OFF";
  const extra = pendingNewCount > 0 ? ` | +${pendingNewCount} new` : "";
  eventsInfoPill.textContent = `${mode} | ${follow}${extra}`;
}

function getEventsTargetStreamer() {
  return getGlobalStreamer() !== "all" ? getGlobalStreamer() : (eventStreamerSel.value || "all");
}

async function refreshEventsJoinQuitTotals(force = false) {
  if (!selectedDay) return null;
  const target = getEventsTargetStreamer();
  const key = `${selectedDay}|${target}`;
  const now = Date.now();
  if (!force && eventsJoinQuitCache.key === key && (now - eventsJoinQuitCache.at) < 5000 && eventsJoinQuitCache.data) {
    return eventsJoinQuitCache.data;
  }
  const data = await fetchJSON(
    `/api/events-totals?day=${encodeURIComponent(selectedDay)}&streamer=${encodeURIComponent(target)}&ts=${Date.now()}`
  );
  eventsJoinQuitCache = { key, at: now, data };
  return data;
}

function updateEventsJoinQuitPills(dataOverride = null) {
  if (!eventsJoinedPill || !eventsQuitPill || !eventsNetPill) return;
  const stats = dataOverride || eventsJoinQuitCache.data;
  const target = getEventsTargetStreamer();
  if (!stats || !selectedDay || stats.day !== selectedDay || stats.streamer !== target) {
    eventsJoinedPill.textContent = "🧩 joined: -";
    eventsQuitPill.textContent = "🚪 quit: -";
    eventsNetPill.textContent = "Δ: -";
    eventsNetPill.classList.remove("pos", "neg");
    return;
  }
  const joined = Number(stats.joined ?? 0) || 0;
  const quit = Number(stats.quit ?? 0) || 0;
  const net = joined - quit;
  const elapsedMs = Number(stats.elapsedMs ?? 0) || 0;
  const joinedText = joined.toLocaleString("pt-BR");
  const quitText = quit.toLocaleString("pt-BR");
  const avgJoin = elapsedMs > 0 ? fmtRatePerMin(joined, elapsedMs) : "-";
  const avgQuit = elapsedMs > 0 ? fmtRatePerMin(quit, elapsedMs) : "-";
  const netText = `${net >= 0 ? "+" : ""}${net.toLocaleString("pt-BR")}`;
  eventsJoinedPill.textContent = `🧩 joined: ${joinedText} avg ${avgJoin}/min`;
  eventsQuitPill.textContent = `🚪 quit: ${quitText} avg ${avgQuit}/min`;
  eventsNetPill.textContent = `Δ: ${netText}`;
  eventsNetPill.classList.toggle("pos", net >= 0);
  eventsNetPill.classList.toggle("neg", net < 0);
}

function likeValueFromEvent(ev) {
  const d = ev?.data || {};
  const likeDelta = Number(d?.likeDelta);
  const likeCount = Number(d?.likeCount);
  const count = Number(d?.count);
  if (Number.isFinite(likeDelta) && likeDelta > 0) return likeDelta;
  if (Number.isFinite(likeCount) && likeCount > 0) return likeCount;
  if (Number.isFinite(count) && count > 0) return count;
  const msg = String(ev?.message || "");
  const md = /likes:\s*(\d+)\s*\|\s*total likes:\s*(\d+)/i.exec(msg);
  if (md) return Math.max(1, Number(md[1] || 1));
  const m = /likes:\s*(\d+)/i.exec(msg);
  if (m) return Math.max(1, Number(m[1] || 1));
  return 1;
}

function totalLikesFromEvent(ev) {
  const d = ev?.data || {};
  const total = Number(d?.totalLikeCount);
  if (Number.isFinite(total) && total > 0) return total;
  const msg = String(ev?.message || "");
  const md = /total likes:\s*(\d+)/i.exec(msg);
  if (md) return Number(md[1] || 0);
  return null;
}

async function computeTotalLikesFromEvents(day, streamer) {
  const data = await fetchJSON(
    `/api/likes-total?day=${encodeURIComponent(day)}&streamer=${encodeURIComponent(streamer)}&ts=${Date.now()}`
  );
  const total = Number(data?.total ?? 0);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

async function refreshEventsTotalLikesSnapshot(force = false) {
  const now = Date.now();
  if (!force && eventsTotalLikesSnapshot.event && (now - eventsTotalLikesSnapshot.at) < EVENTS_TOTAL_LIKES_INTERVAL_MS) {
    return null;
  }
  if (!selectedDay) return null;
  const target = getEventsTargetStreamer();
  try {
    let totalLikes = await computeTotalLikesFromEvents(selectedDay, target);
    const scope = target === "all" ? "todos" : target;
    const totalKey = `${selectedDay}|${target}`;
    if (eventsTotalLikesLast.key === totalKey && Number.isFinite(eventsTotalLikesLast.value)) {
      totalLikes = Math.max(Number(eventsTotalLikesLast.value), totalLikes);
    }
    if (!force && eventsTotalLikesLast.key === totalKey && eventsTotalLikesLast.value === totalLikes) {
      eventsTotalLikesSnapshot = { at: now, event: eventsTotalLikesSnapshot.event };
      return null;
    }
    const ev = {
      ts: new Date(now).toISOString(),
      streamer: target === "all" ? "-" : target,
      type: "likeTotal",
      user: "-",
      message: `total likes: ${totalLikes.toLocaleString("pt-BR")}`,
      highlight: false,
      _k: totalKey
    };
    eventsTotalLikesSnapshot = { at: now, event: ev };
    eventsTotalLikesLast = { key: totalKey, value: totalLikes };
    eventsTotalLikesHistory.unshift(ev);
    if (eventsTotalLikesHistory.length > 240) {
      eventsTotalLikesHistory = eventsTotalLikesHistory.slice(0, 240);
    }
    return ev;
  } catch {
    return null;
  }
}

function scrollEventsToTop() {
  if (!eventsFollow) return;
  eventsList.scrollTop = 0;
}

function isRuntimeOnlineStatus(info) {
  const raw = String(info?.status || "").toLowerCase();
  return raw === "online" || raw === "probing";
}

function applyLikesResetOnReonline(statusSnapshot) {
  const entries = Object.entries(statusSnapshot?.streamers || {});
  const target = getEventsTargetStreamer();
  for (const [name, info] of entries) {
    const prev = streamerWasOnline.get(name);
    const now = isRuntimeOnlineStatus(info);
    if (prev === false && now === true && target === name) {
      eventsTotalLikesSnapshot = { at: 0, event: null };
      eventsTotalLikesLast = { key: "", value: null };
      eventsTotalLikesSeedNeeded = true;
    }
    streamerWasOnline.set(name, now);
  }
}

function renderEvents(events, { animateKeys = null } = {}) {
  eventsList.innerHTML = "";

  const header = document.createElement("div");
  header.className = "tableRow header ev";
  header.innerHTML = `<div class="col-when">When</div><div class="col-streamer">Streamer</div><div class="col-type">Type</div><div class="col-user">User</div><div class="col-message">Message</div>`;
  eventsList.appendChild(header);

  if (!events.length) {
    const row = document.createElement("div");
    row.className = "tableRow ev";
    row.innerHTML = `<div class="col-when cellStrong">-</div><div class="col-streamer">-</div><div class="col-type">-</div><div class="col-user">-</div><div class="col-message">No events (in tail / filters).</div>`;
    eventsList.appendChild(row);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const e of events) {
    const meta = getEventTypeMeta(e.type);
    const row = document.createElement("div");
    row.className = `tableRow ev evt-${meta.key}` + (e.highlight ? " isHighlight" : "");
    if (animateKeys && animateKeys.has(eventKey(e))) row.classList.add("newEvent");
    row.innerHTML = `
      <div class="col-when cellStrong">${fmtTs(e.ts)}</div>
      <div class="col-streamer">${e.streamer || "-"}</div>
      <div class="col-type"><span class="typeTag evt-${meta.key}">${meta.emoji} ${typeLabel(e.type)}</span></div>
      <div class="col-user">${e.user || "-"}</div>
      <div class="col-message">${e.message || "-"}</div>
    `;
    frag.appendChild(row);
  }
  eventsList.appendChild(frag);
}

async function loadEvents() {
  if (!selectedDay) return;
  const reqSeq = ++eventsLoadSeq;

  const streamer = getEventsTargetStreamer();
  const q = (eventSearch.value || "").trim();
  const types = getSelectedEventTypes();

  const data = await fetchJSON(
    `/api/events?day=${encodeURIComponent(selectedDay)}&streamer=${encodeURIComponent(streamer)}&types=${encodeURIComponent(
      types
    )}&q=${encodeURIComponent(q)}&limit=${EVENTS_FETCH_LIMIT}&ts=${Date.now()}`
  );
  if (reqSeq !== eventsLoadSeq) return;

  const events = Array.isArray(data.events) ? [...data.events] : [];
  if (evLike?.checked) {
    const currentLikesKey = `${selectedDay}|${streamer}`;
    const seedNow = eventsTotalLikesSeedNeeded;
    await refreshEventsTotalLikesSnapshot(seedNow);
    if (seedNow) eventsTotalLikesSeedNeeded = false;
    if (reqSeq !== eventsLoadSeq) return;
    if (eventsTotalLikesHistory.length) {
      events.push(...eventsTotalLikesHistory.filter((ev) => ev?._k === currentLikesKey));
    }
  }
  events.sort((a, b) => tsToMs(b?.ts) - tsToMs(a?.ts));
  if (events.length > EVENTS_FETCH_LIMIT) events.length = EVENTS_FETCH_LIMIT;

  const newestTs = events.length ? events[0].ts : null;
  const newestMs = tsToMs(newestTs);
  const lastMs = tsToMs(lastRenderedEventTs);

  if (eventsPaused) {
    if (newestMs > lastMs) {
      pendingNewCount = events.filter((ev) => tsToMs(ev.ts) > lastMs).length;
    }
    updateEventsInfoPill();
    refreshEventsJoinQuitTotals().then(updateEventsJoinQuitPills).catch(() => {});
    return;
  }

  const prevTop = eventsList.scrollTop;
  const prevHeight = eventsList.scrollHeight;
  let animateKeys = null;
  if (lastMs > 0) {
    animateKeys = new Set(
      events
        .filter((ev) => tsToMs(ev.ts) > lastMs)
        .slice(0, 24)
        .map((ev) => eventKey(ev))
    );
  }

  renderEvents(events, { animateKeys });

  pendingNewCount = 0;
  lastRenderedEventTs = newestTs;

  if (!eventsFollow) {
    const newHeight = eventsList.scrollHeight;
    const delta = newHeight - prevHeight;
    eventsList.scrollTop = prevTop + delta;
  } else {
    scrollEventsToTop();
  }

  updateEventsInfoPill();
  refreshEventsJoinQuitTotals().then(updateEventsJoinQuitPills).catch(() => {});
}

function getReportSelectedTypes() {
  const out = [];
  if (rpChat?.checked) out.push("chat");
  if (rpGift?.checked) out.push("gift");
  if (rpMember?.checked) out.push("member");
  if (rpFollow?.checked) out.push("follow");
  if (rpShare?.checked) out.push("share");
  if (rpRoomUser?.checked) out.push("roomUser");
  if (rpGoalUpdate?.checked) out.push("goalUpdate");
  if (rpPollMessage?.checked) out.push("pollMessage");
  if (rpLinkMicBattle?.checked) out.push("linkMicBattle");
  if (rpRoomPin?.checked) out.push("roomPin");
  if (rpQuit?.checked) out.push("quit");
  return out.length ? out : ["chat", "gift", "member"];
}

function getReportTargetStreamer() {
  return getGlobalStreamer() !== "all" ? getGlobalStreamer() : (reportStreamerSel?.value || "all");
}

function formatReportTypeLabel(type) {
  const meta = getEventTypeMeta(type);
  return `${meta.emoji} ${meta.label}`;
}

function trimToWidth(ctx, text, maxWidth) {
  const src = String(text || "");
  if (ctx.measureText(src).width <= maxWidth) return src;
  let lo = 0;
  let hi = src.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const sample = `${src.slice(0, mid)}...`;
    if (ctx.measureText(sample).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${src.slice(0, Math.max(0, lo))}...`;
}

function slugifyFilePart(value, fallback = "all") {
  const txt = String(value || "").trim().toLowerCase();
  if (!txt) return fallback;
  const clean = txt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || fallback;
}

function toCompactTs(isoLike) {
  const d = new Date(isoLike || Date.now());
  if (Number.isNaN(d.getTime())) return String(Date.now());
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function splitHardToken(ctx, token, maxWidth) {
  if (ctx.measureText(token).width <= maxWidth) return [token];
  const parts = [];
  let buf = "";
  for (const ch of token) {
    const next = `${buf}${ch}`;
    if (buf && ctx.measureText(next).width > maxWidth) {
      parts.push(buf);
      buf = ch;
    } else {
      buf = next;
    }
  }
  if (buf) parts.push(buf);
  return parts.length ? parts : [token];
}

function wrapToLines(ctx, text, maxWidth) {
  const src = String(text || "-").replace(/\s+/g, " ").trim() || "-";
  const lines = [];
  let current = "";
  const tokens = src.split(" ").flatMap((t) => splitHardToken(ctx, t, maxWidth));

  for (const token of tokens) {
    const next = current ? `${current} ${token}` : token;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = token;
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function paginateReportRows(events, measureCtx, layout) {
  const pages = [];
  let pageRows = [];
  let y = layout.tableStartY;

  const pushNewPage = () => {
    if (pageRows.length) pages.push(pageRows);
    pageRows = [];
    y = layout.tableStartY;
  };

  for (const ev of events) {
    const msgLinesAll = wrapToLines(measureCtx, ev.message || "-", layout.msgWidth);
    let idx = 0;
    let continued = false;

    while (idx < msgLinesAll.length) {
      const availablePx = layout.tableBottomY - y;
      if (availablePx < layout.minRowPx) {
        pushNewPage();
        continue;
      }

      const maxLinesFit = Math.max(1, Math.floor((availablePx - layout.rowPadBottom) / layout.lineHeight));
      const take = Math.min(maxLinesFit, msgLinesAll.length - idx);
      const segment = msgLinesAll.slice(idx, idx + take);
      const rowHeight = take * layout.lineHeight + layout.rowPadBottom;

      pageRows.push({
        ev,
        continued,
        lines: segment,
        rowHeight
      });
      y += rowHeight;
      idx += take;
      continued = true;
    }
  }
  if (pageRows.length || !pages.length) pages.push(pageRows);
  return pages;
}

function buildReportPages(events, { streamer, types, day, untilTs, queryText, mode = "compact" }) {
  const width = 1080;
  const height = 1920;
  const pages = [];
  const createdAt = new Date().toLocaleString("pt-BR");
  const runStamp = toCompactTs(untilTs);
  const streamerSlug = slugifyFilePart(streamer, "all-streamers");
  const userSlug = slugifyFilePart(queryText, "all-users");
  const isUltra = mode === "ultra";
  const layout = {
    tableStartY: 382,
    tableBottomY: height - 64,
    lineHeight: isUltra ? 24 : 20,
    rowPadBottom: isUltra ? 18 : 14,
    minRowPx: isUltra ? 42 : 34,
    msgWidth: 636
  };

  const typeCounts = new Map();
  for (const ev of events) {
    typeCounts.set(ev.type, (typeCounts.get(ev.type) || 0) + 1);
  }
  const typeSummary = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${formatReportTypeLabel(type)}: ${count}`)
    .join(" | ");

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = isUltra ? "600 20px Segoe UI" : "500 18px Segoe UI";
  const pageRows = paginateReportRows(events, measureCtx, layout);
  const totalPages = Math.max(1, pageRows.length);
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    const chunkRows = pageRows[pageIndex];

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "rgba(36,246,250,0.22)");
    grad.addColorStop(1, "rgba(253,40,84,0.16)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 46px Segoe UI";
    ctx.fillText("TikTok Monitor Report", 56, 84);

    ctx.font = "500 28px Segoe UI";
    ctx.fillStyle = "#24f6fa";
    ctx.fillText(`Day: ${day}`, 56, 128);
    ctx.fillText(`Streamer: ${trimToWidth(ctx, streamer || "-", width - 112)}`, 56, 164);
    ctx.fillText(`User: ${trimToWidth(ctx, queryText || "-", width - 112)}`, 56, 200);

    ctx.fillStyle = "#fd2854";
    ctx.fillText(`Events: ${events.length} | Page ${pageIndex + 1}/${totalPages}`, 56, 236);

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "500 22px Segoe UI";
    ctx.fillText(`Resumo: ${trimToWidth(ctx, typeSummary || "-", width - 112)}`, 56, 272);
    ctx.fillText(`Gerado em: ${createdAt}`, 56, 304);

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(56, 336);
    ctx.lineTo(width - 56, 336);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = isUltra ? "700 22px Segoe UI" : "700 20px Segoe UI";
    const xTime = 56;
    const xType = 184;
    const xMsg = 332;

    ctx.fillText("Hora", xTime, 360);
    ctx.fillText("Tipo", xType, 360);
    ctx.fillText("Mensagem", xMsg, 360);

    let y = layout.tableStartY;
    for (const row of chunkRows) {
      const ev = row.ev;
      const timeTxt = fmtTs(ev.ts).split(", ")[1] || fmtTs(ev.ts);
      const typeTxt = formatReportTypeLabel(ev.type);

      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.font = isUltra ? "600 20px Segoe UI" : "500 18px Segoe UI";

      if (!row.continued) {
        ctx.fillText(trimToWidth(ctx, timeTxt, 116), xTime, y);
        ctx.fillText(trimToWidth(ctx, typeTxt, 132), xType, y);
      }

      for (let i = 0; i < row.lines.length; i++) {
        const msgLine = row.lines[i];
        if (i === 0 && row.continued) {
          ctx.fillStyle = "rgba(255,255,255,0.82)";
          ctx.fillText(`? ${msgLine}`, xMsg, y + i * layout.lineHeight);
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.94)";
          ctx.fillText(msgLine, xMsg, y + i * layout.lineHeight);
        }
      }

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(56, y + row.rowHeight - 6);
      ctx.lineTo(width - 56, y + row.rowHeight - 6);
      ctx.stroke();

      y += row.rowHeight;
    }

    const fileName = `report-${day}-streamer-${streamerSlug}-user-${userSlug}-${runStamp}-p${String(pageIndex + 1).padStart(2, "0")}.png`;
    pages.push({ fileName, dataUrl: canvas.toDataURL("image/png"), downloaded: false });
  }

  return pages;
}

function renderReportPreviewCards(pages) {
  if (!reportPreview) return;
  reportPreview.innerHTML = "";
  if (!pages.length) {
    reportPreview.innerHTML = `<div class="muted">Nenhum item para preview.</div>`;
    return;
  }
  for (const page of pages) {
    const card = document.createElement("div");
    card.className = "reportPreviewCard";
    card.innerHTML = `
      <img src="${page.dataUrl}" alt="${page.fileName}" />
      <div class="rowControls">
        <span class="muted">${page.fileName}</span>
        <span class="pill">${page.downloaded ? "baixado" : "pendente"}</span>
        <button data-download="${page.fileName}">Baixar</button>
        <button data-delete="${page.fileName}">Excluir</button>
      </div>
    `;
    const btn = card.querySelector("button[data-download]");
    btn?.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = page.dataUrl;
      a.download = page.fileName;
      a.click();
      generatedReportPages = generatedReportPages.map((p) =>
        p.fileName === page.fileName ? { ...p, downloaded: true } : p
      );
      renderReportPreviewCards(generatedReportPages);
    });
    const delBtn = card.querySelector("button[data-delete]");
    delBtn?.addEventListener("click", () => {
      generatedReportPages = generatedReportPages.filter((p) => p.fileName !== page.fileName);
      renderReportPreviewCards(generatedReportPages);
      if (reportInfoPill) reportInfoPill.textContent = `imagens: ${generatedReportPages.length}`;
    });
    reportPreview.appendChild(card);
  }
}

function downloadReportPages(pages) {
  const safe = Array.isArray(pages) ? pages : [];
  if (!safe.length) return 0;
  const downloadedNames = [];
  safe.forEach((page) => {
    if (!page?.dataUrl || !String(page.dataUrl).startsWith("data:image/png")) return;
    const a = document.createElement("a");
    a.href = page.dataUrl;
    a.download = page.fileName || `report-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    downloadedNames.push(page.fileName);
  });
  if (downloadedNames.length) {
    generatedReportPages = generatedReportPages.map((p) =>
      downloadedNames.includes(p.fileName) ? { ...p, downloaded: true } : p
    );
    renderReportPreviewCards(generatedReportPages);
  }
  return downloadedNames.length;
}

async function generateReportImages({ autoDownload = false } = {}) {
  if (!selectedDay) return;
  const streamer = getReportTargetStreamer();
  const types = getReportSelectedTypes();
  const q = String(reportSearch?.value || "").trim();
  const batchLimit = Math.max(100, Math.min(1500, Number(reportLimit?.value || 400)));
  const maxTotal = 12000;
  const untilTs = new Date().toISOString();

  if (reportInfoPill) reportInfoPill.textContent = "gerando...";
  const events = [];
  let offset = 0;
  let hasMore = true;
  let totalFiltered = 0;
  while (hasMore && events.length < maxTotal) {
    const data = await fetchJSON(
      `/api/events?day=${encodeURIComponent(selectedDay)}&streamer=${encodeURIComponent(streamer)}&types=${encodeURIComponent(
        types.join(",")
      )}&q=${encodeURIComponent(q)}&limit=${batchLimit}&offset=${offset}&untilTs=${encodeURIComponent(untilTs)}&ts=${Date.now()}`
    );
    const batch = Array.isArray(data?.events) ? data.events : [];
    events.push(...batch);
    totalFiltered = Number(data?.totalFiltered || events.length);
    hasMore = !!data?.hasMore && batch.length > 0;
    offset += batch.length;
    if (!batch.length) break;
  }

  if (!events.length) {
    if (reportInfoPill) reportInfoPill.textContent = "sem eventos para filtros";
    renderReportPreviewCards([]);
    return;
  }

  const capped = events.slice(0, maxTotal);
  const pages = buildReportPages(capped, { streamer, types, day: selectedDay, untilTs, queryText: q, mode: reportRenderMode });
  generatedReportPages = pages;
  renderReportPreviewCards(generatedReportPages);
  const cappedTxt = capped.length < totalFiltered ? ` (mostrando ${capped.length}/${totalFiltered})` : "";
  if (reportInfoPill) reportInfoPill.textContent = `modo: ${reportRenderMode === "ultra" ? "ultra leg�vel" : "compacto"} | eventos: ${totalFiltered}${cappedTxt} | imagens: ${pages.length}`;

  if (autoDownload) {
    const count = downloadReportPages(generatedReportPages);
    if (reportInfoPill) reportInfoPill.textContent = `${reportInfoPill.textContent} | downloads: ${count}`;
  }
}

function renderRankingList(el, items, { showSources = false, kind = "default" } = {}) {
  el.innerHTML = "";
  const meta = getRankingMeta(kind);
  const globalStreamer = getGlobalStreamer();
  const filtered = (items || []).filter((it) => {
    if (globalStreamer === "all") return true;
    if (!it?.streamer) return true;
    return it.streamer === globalStreamer;
  });

  if (!filtered.length) {
    el.innerHTML = `<div class="muted">-</div>`;
    return;
  }

  filtered.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = `rankRow rk-${meta.key}`;

    const name = it.streamer || it.user || "-";
    const value = it.value ?? it.count ?? 0;
    const sourcesTxt = Array.isArray(it.sources) && it.sources.length
      ? it.sources.map((s) => `${s.streamer}: ${s.count}`).join(" | ")
      : "";

    row.innerHTML = `
      <div class="rankIdx">#${idx + 1}</div>
      <div class="rankMain">${meta.emoji} ${name}</div>
      <div class="rankVal">${value}</div>
      ${showSources && sourcesTxt ? `<div class="rankSub">Sources: ${sourcesTxt}</div>` : ""}
    `;
    el.appendChild(row);
  });
}

function renderRankingKpis(lb = {}) {
  const totalTopPeak = (lb.byPeakViewers || []).reduce((acc, it) => acc + Number(it?.value || 0), 0);
  const totalTopCurrent = (lb.byCurrentViewers || []).reduce((acc, it) => acc + Number(it?.value || 0), 0);
  const totalTopMsgs = (lb.byMsgsPerMin || []).reduce((acc, it) => acc + Number(it?.value || 0), 0);
  const totalTopChats = (lb.byTotalChats || []).reduce((acc, it) => acc + Number(it?.value || 0), 0);
  const totalTopGifts = (lb.byTotalGifts || []).reduce((acc, it) => acc + Number(it?.value || 0), 0);

  const panelTitle = document.querySelector("#view-rankings .panelTitle");
  if (!panelTitle) return;
  panelTitle.innerHTML = `\u{1F3C6} Daily rankings <span class="muted">| \u{1F451} peak viewers: ${totalTopPeak} | \u{1F440} current viewers: ${totalTopCurrent} | \u26A1 msgs/min: ${totalTopMsgs} | \u{1F4AC} chats: ${totalTopChats} | \u{1F381} gifts: ${totalTopGifts}</span>`;
}

async function loadRankings() {
  if (!selectedDay || rankingsLoading) return;
  const reqSeq = ++rankingsLoadSeq;
  rankingsLoading = true;
  try {
    setPill("rankings...");
    const data = await fetchJSON(`/api/rankings?day=${encodeURIComponent(selectedDay)}&ts=${Date.now()}`);
    if (reqSeq !== rankingsLoadSeq) return;

    const lb = data.leaderboards || {};
    const global = data.global || {};

    renderRankingKpis(lb);
    renderRankingList(rkPeakViewers, lb.byPeakViewers || [], { kind: "peak" });
    renderRankingList(rkCurrentViewers, lb.byCurrentViewers || [], { kind: "current" });
    renderRankingList(rkMsgsPerMin, lb.byMsgsPerMin || [], { kind: "mpm" });
    renderRankingList(rkTotalChats, lb.byTotalChats || [], { kind: "chat" });
    renderRankingList(rkTotalGifts, lb.byTotalGifts || [], { kind: "gift" });
    renderRankingList(rkGlobalChatters, global.topChatters || [], { showSources: true, kind: "chatters" });
    renderRankingList(rkGlobalGifters, global.topGifters || [], { showSources: true, kind: "gifters" });

    setPill("live");
  } finally {
    rankingsLoading = false;
  }
}

function typeLabel(t) {
  return getEventTypeMeta(t).label;
}

function parseEditorItems(editor) {
  return String(editor?.value || "")
    .split(/\r?\n/)
    .map((x) => x.trim().replace(/^@+/, ""))
    .filter(Boolean);
}

function validateListItems(items) {
  const valid = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Set();

  for (const raw of items) {
    const item = String(raw || "").trim().replace(/^@+/, "");
    if (!item) continue;

    if (!/^[a-zA-Z0-9._]+$/.test(item)) {
      invalid.push(item);
      continue;
    }

    const k = item.toLowerCase();
    if (seen.has(k)) {
      duplicates.push(item);
      continue;
    }
    seen.add(k);
    valid.push(item);
  }

  return { valid, invalid, duplicates };
}

function renderListWarnings(el, report) {
  if (!el) return;
  const invalidCount = report?.invalid?.length || 0;
  const dupCount = report?.duplicates?.length || 0;

  if (!invalidCount && !dupCount) {
    el.textContent = "OK";
    return;
  }

  const parts = [];
  if (invalidCount) parts.push(`invalid: ${invalidCount}`);
  if (dupCount) parts.push(`duplicates: ${dupCount}`);
  el.textContent = `Warning (${parts.join(" | ")})`;
}

let listEditorsDirty = false;
if (streamersEditor) streamersEditor.addEventListener("input", () => {
  listEditorsDirty = true;
  const report = validateListItems(parseEditorItems(streamersEditor));
  if (streamersInfo) streamersInfo.textContent = `items: ${report.valid.length}`;
  renderListWarnings(streamersWarnings, report);
});
if (highlightUsersEditor) highlightUsersEditor.addEventListener("input", () => {
  listEditorsDirty = true;
  const report = validateListItems(parseEditorItems(highlightUsersEditor));
  if (highlightUsersInfo) highlightUsersInfo.textContent = `items: ${report.valid.length}`;
  renderListWarnings(highlightUsersWarnings, report);
});

async function loadLists({ keepLocalIfDirty = false } = {}) {
  const data = await fetchJSON(`/api/lists?ts=${Date.now()}`);
  const streamers = data.streamers || [];
  const highlightUsers = data.highlightUsers || [];

  if (!(keepLocalIfDirty && listEditorsDirty)) {
    if (streamersEditor) streamersEditor.value = streamers.join("\n");
    if (highlightUsersEditor) highlightUsersEditor.value = highlightUsers.join("\n");
    listEditorsDirty = false;
  }

  const streamersReport = validateListItems(parseEditorItems(streamersEditor));
  const highlightReport = validateListItems(parseEditorItems(highlightUsersEditor));

  if (streamersInfo) streamersInfo.textContent = `items: ${streamersReport.valid.length}`;
  if (highlightUsersInfo) highlightUsersInfo.textContent = `items: ${highlightReport.valid.length}`;
  renderListWarnings(streamersWarnings, streamersReport);
  renderListWarnings(highlightUsersWarnings, highlightReport);
}

async function saveList(kind, editor, infoEl, warningEl) {
  if (!editor) return;
  const report = validateListItems(parseEditorItems(editor));
  renderListWarnings(warningEl, report);

  if (!report.valid.length) {
    if (infoEl) infoEl.textContent = "nothing to save";
    return;
  }

  const ask = window.confirm(
    `Save ${report.valid.length} item(s)?` +
    `${report.invalid.length ? `\n- invalid ignored: ${report.invalid.length}` : ""}` +
    `${report.duplicates.length ? `\n- duplicates ignored: ${report.duplicates.length}` : ""}`
  );
  if (!ask) return;

  const data = await fetchJSONWithOptions(`/api/lists/${kind}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...getAdminHeaders() },
    body: JSON.stringify({ items: report.valid })
  });
  listEditorsDirty = false;
  if (infoEl) infoEl.textContent = `saved: ${data.count}`;
  await loadLists();
}

function addItemToEditor(inputEl, editorEl, infoEl, warningEl) {
  const value = String(inputEl?.value || "").trim().replace(/^@+/, "");
  if (!value || !editorEl) return;

  const current = parseEditorItems(editorEl);
  current.push(value);
  const report = validateListItems(current);
  editorEl.value = report.valid.join("\n");
  inputEl.value = "";
  listEditorsDirty = true;

  if (infoEl) infoEl.textContent = `items: ${report.valid.length}`;
  renderListWarnings(warningEl, report);
}

function cleanEditorItems(editorEl, infoEl, warningEl) {
  if (!editorEl) return;
  const report = validateListItems(parseEditorItems(editorEl));
  editorEl.value = report.valid.join("\n");
  listEditorsDirty = true;
  if (infoEl) infoEl.textContent = `items: ${report.valid.length}`;
  renderListWarnings(warningEl, report);
}




function renderHighlights(items) {
  hlList.innerHTML = "";

  const header = document.createElement("div");
  header.className = "tableRow header hl";
  header.innerHTML = `<div>When</div><div>User</div><div>Streamer</div><div>Type</div><div>Message</div>`;
  hlList.appendChild(header);

  if (!items.length) {
    const row = document.createElement("div");
    row.className = "tableRow hl";
    row.innerHTML = `<div class="cellStrong">-</div><div>-</div><div>-</div><div>-</div><div>No highlights (in tail / filters).</div>`;
    hlList.appendChild(row);
    return;
  }

  for (const it of items) {
    const meta = getEventTypeMeta(it.type);
    const row = document.createElement("div");
    row.className = `tableRow hl isHighlight evt-${meta.key}`;

    const user = it.user || it.highlightUser || "-";

    const msg =
      !it.message ? "-" :
      it.message === it.type ? "-" :
      it.message;

    row.innerHTML = `
      <div class="cellStrong">${fmtTs(it.ts)}</div>
      <div>${user}</div>
      <div>${it.streamer || "-"}</div>
      <div><span class="typeTag evt-${meta.key}">${meta.emoji} ${typeLabel(it.type)}</span></div>

      <div>${msg}</div>
    `;
    hlList.appendChild(row);
  }
}

async function loadHighlights() {
  if (!selectedDay) return;

  const user = hlUserSel.value || "all";
  const streamer = getGlobalStreamer() !== "all" ? getGlobalStreamer() : (hlStreamerSel.value || "all");
  const types = hlTypesSel.value || "all";
  const q = (hlSearch.value || "").trim();

  const data = await fetchJSON(
    `/api/highlights?day=${encodeURIComponent(selectedDay)}&user=${encodeURIComponent(user)}&streamer=${encodeURIComponent(
      streamer
    )}&types=${encodeURIComponent(types)}&q=${encodeURIComponent(q)}&limit=300`
  );

  const users = ["all", ...(data.users || [])];
  rebuildSelect(hlUserSel, users, "all");

  const streamers = (window.__lastSummary?.streamers || []).map((s) => s.streamer);
  rebuildSelect(hlStreamerSel, ["all", ...streamers], "all");

  renderHighlights(data.highlights || []);
  hlInfoPill.textContent = `items: ${(data.highlights || []).length}`;

  setPill("live");
}
function startSSE() {
  if (sse) {
    sse.close();
    sse = null;
  }
  if (!selectedDay) return;

  sse = new EventSource(`/api/sse?day=${encodeURIComponent(selectedDay)}`);

  sse.addEventListener("summary", (ev) => {
    try {
      const data = JSON.parse(ev.data);
      renderCards(data);
      if (selectedStreamer) loadStreamerDetails().catch(() => {});
      if (activeTab === "rankings") loadRankings().catch(() => {});
    } catch {}
  });

  sse.addEventListener("error", () => setPill("sse dropped... retrying..."));
}

daySelect.addEventListener("change", async () => {
  selectedDay = daySelect.value;
  lastCardsSignature = "";

  selectedStreamer = null;
  selectedStreamerEl.textContent = "(click a card)";
  destroyCharts();

  mpmTitle.textContent = "\u26A1 Msgs/min";
  viewersTitle.textContent = "\u{1F440} Viewers";
  if (mpmExtremaEl) mpmExtremaEl.innerHTML = "Max.: - | Min.: -";
  if (viewersExtremaEl) viewersExtremaEl.innerHTML = "Max.: - | Min.: -";
  topChatTitle.textContent = "\u{1F5E8}\uFE0F Top chatters";
  topGiftTitle.textContent = "\u{1F381} Top gifters";
  totalsTitle.textContent = "Totals";

  topChattersEl.innerHTML = "";
  topGiftersEl.innerHTML = "";
  totalsBox.textContent = "";

  lastRenderedEventTs = null;
  pendingNewCount = 0;
  eventsTotalLikesSeedNeeded = true;
  eventsJoinQuitCache = { key: "", at: 0, data: null };
  updateEventsInfoPill();
  updateEventsJoinQuitPills();

  await loadSummary();
  startSSE();

  if (activeTab === "alerts") await loadAlerts();
  if (activeTab === "anomalies") await loadAnomalies();
  if (activeTab === "rankings") await loadRankings();
  if (activeTab === "events") await loadEvents();
  if (activeTab === "reports" && reportInfoPill) reportInfoPill.textContent = "dia alterado, clique em gerar";
});

if (refreshBtn) {
  refreshBtn.addEventListener("click", async () => {
    lastCardsSignature = "";
    await loadSummary();
    startSSE();

    if (activeTab === "alerts") await loadAlerts();
    if (activeTab === "anomalies") await loadAnomalies();
    if (activeTab === "rankings") await loadRankings();
    if (activeTab === "events") await loadEvents();
    if (activeTab === "reports" && reportInfoPill) reportInfoPill.textContent = "dados atualizados, clique em gerar";
  });
}

alertsRefreshBtn.addEventListener("click", () => loadAlerts().catch(() => {}));
alertStreamerSel.addEventListener("change", () => activeTab === "alerts" && loadAlerts().catch(() => {}));
alertIncludeSystem.addEventListener("change", () => activeTab === "alerts" && loadAlerts().catch(() => {}));
anomaliesRefreshBtn.addEventListener("click", () => loadAnomalies().catch(() => {}));
anomalyStreamerSel.addEventListener("change", () => activeTab === "anomalies" && loadAnomalies().catch(() => {}));

eventsRefreshBtn.addEventListener("click", () => loadEvents().catch(() => {}));
eventStreamerSel.addEventListener("change", () => {
  eventsTotalLikesSeedNeeded = true;
  eventsJoinQuitCache = { key: "", at: 0, data: null };
  refreshEventsJoinQuitTotals(true).then(updateEventsJoinQuitPills).catch(() => {});
  if (activeTab === "events") loadEvents().catch(() => {});
});
eventSearch.addEventListener("input", () => activeTab === "events" && loadEvents().catch(() => {}));
[evChat, evGift, evFollow, evShare, evMember, evRoomUser, evLike, evQuit].forEach((cb) => {
  cb.addEventListener("change", () => activeTab === "events" && loadEvents().catch(() => {}));
});

eventsList.addEventListener("scroll", () => {
  const nearTop = eventsList.scrollTop <= 20;
  eventsFollow = nearTop;
  updateEventsInfoPill();
});

eventsPauseBtn.addEventListener("click", async () => {
  eventsPaused = !eventsPaused;
  eventsPauseBtn.textContent = eventsPaused ? "Resume" : "Pause";

  if (!eventsPaused) {
    pendingNewCount = 0;
    eventsFollow = true;
    await loadEvents().catch(() => {});
    scrollEventsToTop();
  }

  updateEventsInfoPill();
});

eventsFollowBtn.addEventListener("click", () => {
  eventsFollow = true;
  pendingNewCount = 0;
  updateEventsInfoPill();
  scrollEventsToTop();
});


hlRefreshBtn.addEventListener("click", () => loadHighlights().catch(() => {}));
hlUserSel.addEventListener("change", () => activeTab === "highlights" && loadHighlights().catch(() => {}));
hlStreamerSel.addEventListener("change", () => activeTab === "highlights" && loadHighlights().catch(() => {}));
hlTypesSel.addEventListener("change", () => activeTab === "highlights" && loadHighlights().catch(() => {}));
hlSearch.addEventListener("input", () => activeTab === "highlights" && loadHighlights().catch(() => {}));

if (reportPreviewBtn) reportPreviewBtn.addEventListener("click", () => generateReportImages({ autoDownload: false }).catch(() => {}));
if (reportDownloadBtn) {
  reportDownloadBtn.addEventListener("click", async () => {
    if (generatedReportPages.length) {
      const count = downloadReportPages(generatedReportPages);
      if (reportInfoPill) reportInfoPill.textContent = `imagens: ${generatedReportPages.length} | downloads: ${count}`;
      return;
    }
    await generateReportImages({ autoDownload: true }).catch(() => {});
  });
}
if (reportModeBtn) {
  reportModeBtn.addEventListener("click", () => {
    reportRenderMode = reportRenderMode === "compact" ? "ultra" : "compact";
    reportModeBtn.textContent = `Modo: ${reportRenderMode === "ultra" ? "ultra leg�vel" : "compacto"}`;
    if (activeTab === "reports" && reportInfoPill) reportInfoPill.textContent = "modo alterado, gere novamente";
  });
}
[reportStreamerSel, reportSearch, reportLimit, rpChat, rpGift, rpMember, rpFollow, rpShare, rpRoomUser, rpGoalUpdate, rpPollMessage, rpLinkMicBattle, rpRoomPin, rpQuit].forEach((el) => {
  if (!el) return;
  const evt = el.tagName === "INPUT" && el.type === "text" ? "input" : "change";
  el.addEventListener(evt, () => {
    if (activeTab === "reports" && reportInfoPill) reportInfoPill.textContent = "filtros alterados, clique em gerar";
  });
});

if (globalStreamerSel) {
  globalStreamerSel.addEventListener("change", async () => {
    eventsTotalLikesSeedNeeded = true;
    eventsJoinQuitCache = { key: "", at: 0, data: null };
    await loadSummary();
    if (latestStatusSnapshot) {
      renderTopStatus(latestStatusSnapshot);
      refreshEventsJoinQuitTotals(true).then(updateEventsJoinQuitPills).catch(() => {});
    }
    if (activeTab === "events") await loadEvents().catch(() => {});
    if (activeTab === "alerts") await loadAlerts().catch(() => {});
    if (activeTab === "anomalies") await loadAnomalies().catch(() => {});
    if (activeTab === "highlights") await loadHighlights().catch(() => {});
    if (activeTab === "rankings") await loadRankings().catch(() => {});
    if (activeTab === "reports" && reportInfoPill) reportInfoPill.textContent = "streamer alterado, clique em gerar";
  });
}
if (rangeSelect) {
  rangeSelect.addEventListener("change", () => {
    if (selectedStreamer) loadStreamerDetails().catch(() => {});
  });
}

if (streamersReloadBtn) streamersReloadBtn.addEventListener("click", () => loadLists().catch(() => {}));
if (highlightUsersReloadBtn) highlightUsersReloadBtn.addEventListener("click", () => loadLists().catch(() => {}));
if (streamersSaveBtn) streamersSaveBtn.addEventListener("click", () => saveList("streamers", streamersEditor, streamersInfo, streamersWarnings).catch(() => {}));
if (highlightUsersSaveBtn) highlightUsersSaveBtn.addEventListener("click", () => saveList("highlight-users", highlightUsersEditor, highlightUsersInfo, highlightUsersWarnings).catch(() => {}));
if (streamersCleanBtn) streamersCleanBtn.addEventListener("click", () => cleanEditorItems(streamersEditor, streamersInfo, streamersWarnings));
if (highlightUsersCleanBtn) highlightUsersCleanBtn.addEventListener("click", () => cleanEditorItems(highlightUsersEditor, highlightUsersInfo, highlightUsersWarnings));
if (streamerAddBtn) streamerAddBtn.addEventListener("click", () => addItemToEditor(streamerAddInput, streamersEditor, streamersInfo, streamersWarnings));
if (highlightAddBtn) highlightAddBtn.addEventListener("click", () => addItemToEditor(highlightAddInput, highlightUsersEditor, highlightUsersInfo, highlightUsersWarnings));
if (streamerAddInput) streamerAddInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addItemToEditor(streamerAddInput, streamersEditor, streamersInfo, streamersWarnings);
  }
});
if (highlightAddInput) highlightAddInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addItemToEditor(highlightAddInput, highlightUsersEditor, highlightUsersInfo, highlightUsersWarnings);
  }
});

async function loadBotStatus() {

  try {

    const status = await fetchJSON("/api/status");

    let el = document.getElementById("botStatusBar");

    if (!el) {

      el = document.createElement("div");
      el.id = "botStatusBar";

      el.style.background = "rgba(0,0,0,0.85)";
      el.style.borderBottom = "1px solid rgba(36,246,250,0.35)";
      el.style.padding = "8px 14px";
      el.style.fontFamily = "monospace";
      el.style.fontSize = "13px";
      el.style.color = "#24f6fa";

    }

  } catch {

    console.warn("status.json not found");

  }

}

function fmtUptime(ms) {
  ms = Number(ms || 0);
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

function fmtRatePerMin(count, elapsedMs) {
  const total = Number(count ?? 0);
  const mins = Math.max(1, Number(elapsedMs ?? 0) / 60000);
  if (!Number.isFinite(total) || !Number.isFinite(mins)) return "-";
  return (total / mins).toFixed(2);
}

function getJoinQuitStats(st) {
  const day = st?.summaries?.day || null;
  const scope = getGlobalStreamer();
  const totals =
    scope !== "all"
      ? day?.streamers?.[scope]?.totals || null
      : day?.eventTotals || null;
  const joined = Number(totals?.member ?? 0) || 0;
  const quit = Number(totals?.quit ?? 0) || 0;
  const startedAtMs = tsToMs(day?.startedAt);
  const nowMs = tsToMs(st?.ts) || Date.now();
  const elapsedMs = startedAtMs > 0 && nowMs > startedAtMs ? nowMs - startedAtMs : 0;
  return {
    scope,
    joined,
    quit,
    net: joined - quit,
    elapsedMs
  };
}

function renderTopStatus(st) {
  const ver = st.version || "?";
  const up = fmtUptime(st.uptimeMs);
  const streamers = Object.values(st.streamers || {});
  const streamerEntries = Object.entries(st.streamers || {});

  const statusBuckets = {
    online: [],
    probing: [],
    offline: [],
    paused: [],
    circuitOpen: []
  };

  for (const [name, info] of streamerEntries) {
    const raw = String(info?.status || "offline").toLowerCase();
    const effective =
      raw === "online" || raw === "probing" || raw === "paused"
        ? raw
        : "offline";
    if (statusBuckets[effective]) statusBuckets[effective].push(name);

    const until = info?.connection?.circuitOpenUntil;
    if (typeof until === "number" && until > Date.now()) {
      statusBuckets.circuitOpen.push(name);
    }
  }

  const tip = (label, list) =>
    `${label}\n${list.length ? list.join("\n") : "(none)"}`;
  const escAttr = (v) =>
    String(v || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const jq = getJoinQuitStats(st || {});
  const joinedText = Number.isFinite(jq.joined) ? jq.joined.toLocaleString("pt-BR") : "-";
  const quitText = Number.isFinite(jq.quit) ? jq.quit.toLocaleString("pt-BR") : "-";
  const joinAvg = jq.elapsedMs > 0 ? fmtRatePerMin(jq.joined, jq.elapsedMs) : "-";
  const quitAvg = jq.elapsedMs > 0 ? fmtRatePerMin(jq.quit, jq.elapsedMs) : "-";
  const netText = Number.isFinite(jq.net) ? `${jq.net >= 0 ? "+" : ""}${jq.net.toLocaleString("pt-BR")}` : "-";
  const scopeLabel = jq.scope === "all" ? "todos" : `@${jq.scope}`;
  const periodTip = jq.elapsedMs > 0 && st?.summaries?.day?.startedAt
    ? `Período: ${fmtTs(st.summaries.day.startedAt)} → agora\nFiltro: ${scopeLabel}`
    : `Filtro: ${scopeLabel}`;

  document.title = `TikTok Monitor v${ver} | Up: ${up}`;
  if (!topStatusEl) return;
  topStatusEl.dataset.health = "ok";

  topStatusEl.innerHTML = `
    <span><b>v${ver}</b></span>
    <span>Uptime: <b>${up}</b></span>
    <span class="statusHint" data-tip="${escAttr(tip("Online streamers", statusBuckets.online))}">Online: <b>${statusBuckets.online.length}</b></span>
    <span class="statusHint" data-tip="${escAttr(tip("Offline streamers", statusBuckets.offline))}">Offline: <b>${statusBuckets.offline.length}</b></span>
    <span class="statusHint" data-tip="${escAttr(periodTip)}">🧩 Joined: <b>${joinedText}</b><span class="statusAvg">avg ${joinAvg}/min</span></span>
    <span class="statusHint" data-tip="${escAttr(periodTip)}">🚪 Quit: <b>${quitText}</b><span class="statusAvg">avg ${quitAvg}/min</span></span>
    <span class="statusHint statusNet ${jq.net >= 0 ? "pos" : "neg"}" data-tip="${escAttr(periodTip)}">Δ: <b>${netText}</b></span>
  `;
}

async function refreshTopStatus() {
  try {
    const st = await fetchJSON(`/api/status?ts=${Date.now()}`);
    latestStatusSnapshot = st || { streamers: {} };
    applyLikesResetOnReonline(latestStatusSnapshot);
    renderTopStatus(st);
    if (activeTab === "events") {
      refreshEventsJoinQuitTotals().then(updateEventsJoinQuitPills).catch(() => {});
    }
    if (window.__lastSummary) renderCards(window.__lastSummary);
  } catch {}
}

try {
  const savedToken = localStorage.getItem("dashboard_admin_token") || "";
  if (adminTokenInput) adminTokenInput.value = savedToken;
  if (adminTokenInput) {
    adminTokenInput.addEventListener("input", () => {
      localStorage.setItem("dashboard_admin_token", String(adminTokenInput.value || ""));
    });
  }
} catch {}


(async function init() {

  await loadBotStatus();
  await loadDays();
  await refreshTopStatus();
  setInterval(refreshTopStatus, 3000);

  if (selectedDay) {
    await loadSummary();
    startSSE();
  }
  updateEventsInfoPill();
  setTab("dashboard");
  document.body.classList.add("ready");
})();
