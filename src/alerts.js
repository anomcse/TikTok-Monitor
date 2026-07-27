export function createAlerts({ enabled = true, keywords = [], antiSpam = null, gifts = null } = {}) {
  const userMsgTimes = {};
  const giftCfg = gifts && typeof gifts === "object" ? gifts : {};

  function ensure(streamer, user) {
    if (!userMsgTimes[streamer]) userMsgTimes[streamer] = {};
    if (!userMsgTimes[streamer][user]) userMsgTimes[streamer][user] = [];
    return userMsgTimes[streamer][user];
  }

  function checkKeyword(comment = "") {
    const text = String(comment).toLowerCase();
    for (const kw of keywords) {
      if (kw && text.includes(String(kw).toLowerCase())) return kw;
    }
    return null;
  }

  function checkSpam(streamer, user) {
    if (!antiSpam || !user) return false;

    const arr = ensure(streamer, user);
    const now = Date.now();
    arr.push(now);

    const cutoff = now - antiSpam.sameUserWindowMs;
    while (arr.length && arr[0] < cutoff) arr.shift();

    return arr.length >= antiSpam.sameUserMaxMsgs;
  }

  function normalizeGiftName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function matchesGiftName(name) {
    const list = Array.isArray(giftCfg?.names) ? giftCfg.names : [];
    if (!list.length) return true;
    const n = normalizeGiftName(name);
    if (!n) return false;
    return list.some((item) => {
      const v = normalizeGiftName(item);
      if (!v) return false;
      return n.includes(v);
    });
  }
  function onChatEvent({ streamer, user, comment }) {
    if (!enabled) return null;

    const hit = checkKeyword(comment);
    if (hit) {
      return {
        type: "keyword",
        streamer,
        user,
        keyword: hit,
        comment
      };
    }

    if (checkSpam(streamer, user)) {
      return {
        type: "spam",
        streamer,
        user,
        comment
      };
    }

    return null;
  }

  function onGiftEvent({ streamer, user, giftName, repeatCount, diamonds, totalDiamonds }) {
    if (!enabled || !giftCfg?.enabled) return null;
    if (!matchesGiftName(giftName)) return null;

    const minRepeat = Number(giftCfg?.minRepeatCount ?? 0);
    const minCoins = Number(giftCfg?.minCoins ?? 0);

    const checks = [];
    if (Number.isFinite(minRepeat) && minRepeat > 0) {
      checks.push((Number(repeatCount) || 0) >= minRepeat);
    }
    if (Number.isFinite(minCoins) && minCoins > 0) {
      checks.push((Number(totalDiamonds) || 0) >= minCoins);
    }

    const passes = checks.length ? checks.some(Boolean) : true;
    if (!passes) return null;

    return {
      type: "gift",
      streamer,
      user,
      giftName,
      repeatCount,
      diamonds,
      totalDiamonds
    };
  }

  return { onChatEvent, onGiftEvent };
}


