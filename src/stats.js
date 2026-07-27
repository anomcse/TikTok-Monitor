export function createStats() {
  const DEFAULT_TOTALS = {
    chat: 0,
    gift: 0,
    member: 0,
    follow: 0,
    share: 0,
    like: 0,
    roomUser: 0,
    goalUpdate: 0,
    pollMessage: 0,
    linkMicBattle: 0,
    roomPin: 0
  };
  const state = {};

  function resetStateMetrics(s) {
    s.total = { ...DEFAULT_TOTALS };
    s.chatters = new Map();
    s.gifters = new Map();
    s.chatTimestamps = [];
    s.viewers = { current: null, max: null };
    s.lastSnapshot = { at: null, msgsPerMin: 0 };
  }

  function get(streamer) {
    if (!state[streamer]) {
      state[streamer] = {
        connectedAt: null,
        roomId: null,
        lastRoomId: null,
        total: { ...DEFAULT_TOTALS },
        chatters: new Map(),
        gifters: new Map(),
        chatTimestamps: [],
        viewers: { current: null, max: null },
        lastSnapshot: { at: null, msgsPerMin: 0 }
      };
    }
    return state[streamer];
  }

  function onConnected(streamer, roomId) {
    const s = get(streamer);
    const nextRoomId = roomId ?? null;
    const previousRoomId = s.roomId ?? s.lastRoomId ?? null;

    if (nextRoomId && previousRoomId && nextRoomId !== previousRoomId) {
      resetStateMetrics(s);
    }

    s.connectedAt = Date.now();
    s.roomId = nextRoomId;
    if (nextRoomId) s.lastRoomId = nextRoomId;
  }

  function onDisconnected(streamer) {
    const s = get(streamer);
    if (s.roomId) s.lastRoomId = s.roomId;
    s.connectedAt = null;
    s.roomId = null;
  }

  function resetSession(streamer) {
    const s = get(streamer);
    resetStateMetrics(s);
  }

  function addChat(streamer, user) {
    const s = get(streamer);
    s.total.chat++;
    if (user) s.chatters.set(user, (s.chatters.get(user) || 0) + 1);

    const now = Date.now();
    s.chatTimestamps.push(now);
    const cutoff = now - 60_000;
    while (s.chatTimestamps.length && s.chatTimestamps[0] < cutoff) s.chatTimestamps.shift();
  }

  function addGift(streamer, user, repeatCount = 1) {
    const s = get(streamer);
    s.total.gift++;
    if (user) s.gifters.set(user, (s.gifters.get(user) || 0) + (repeatCount || 1));
  }

  function addMember(streamer) {
    get(streamer).total.member++;
  }

  function addFollow(streamer) {
    get(streamer).total.follow++;
  }

  function addShare(streamer) {
    get(streamer).total.share++;
  }

  function addLike(streamer, count = 1) {
    const n = Number.isFinite(Number(count)) ? Number(count) : 1;
    get(streamer).total.like += Math.max(1, n);
  }

  function addRoomUser(streamer) {
    get(streamer).total.roomUser++;
  }

  function addGoalUpdate(streamer) {
    get(streamer).total.goalUpdate++;
  }

  function addPollMessage(streamer) {
    get(streamer).total.pollMessage++;
  }

  function addLinkMicBattle(streamer) {
    get(streamer).total.linkMicBattle++;
  }

  function addRoomPin(streamer) {
    get(streamer).total.roomPin++;
  }

  function setViewers(streamer, count) {
    const s = get(streamer);
    if (typeof count === "number") {
      s.viewers.current = count;
      if (s.viewers.max == null || count > s.viewers.max) s.viewers.max = count;
    }
  }

  function msgsPerMin(streamer) {
    return get(streamer).chatTimestamps.length;
  }

  function topFromMap(map, n) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  function topChatters(streamer, n = 5) {
    return topFromMap(get(streamer).chatters, n);
  }

  function topGifters(streamer, n = 5) {
    return topFromMap(get(streamer).gifters, n);
  }

  function snapshot(streamer, topN = 10) {
    const s = get(streamer);
    return {
      connectedAt: s.connectedAt,
      roomId: s.roomId,
      totals: { ...s.total },
      viewers: { ...s.viewers },
      msgsPerMin: msgsPerMin(streamer),
      topChatters: topChatters(streamer, topN),
      topGifters: topGifters(streamer, topN)
    };
  }

  function updateLastSnapshot(streamer, { at, msgsPerMin }) {
    const s = get(streamer);
    s.lastSnapshot.at = at;
    s.lastSnapshot.msgsPerMin = msgsPerMin;
  }

  function getLastSnapshot(streamer) {
    return get(streamer).lastSnapshot;
  }

  return {
    get,
    onConnected,
    onDisconnected,
    resetSession,
    addChat,
    addGift,
    addMember,
    addFollow,
    addShare,
    addLike,
    addRoomUser,
    addGoalUpdate,
    addPollMessage,
    addLinkMicBattle,
    addRoomPin,
    setViewers,
    msgsPerMin,
    topChatters,
    topGifters,
    snapshot,
    updateLastSnapshot,
    getLastSnapshot
  };
}
