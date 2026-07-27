/**
 * TikTok Live Connector - Constantes e Configuração
 */

/**
 * Classificação de razões de desconexão
 * @enum {string}
 */
export const DISCONNECT_REASON_TYPES = {
  RATE_LIMIT: "rate_limit",
  AUTH: "auth",
  STREAM_END: "stream_end",
  OFFLINE: "offline",
  TIMEOUT: "timeout",
  WATCHDOG: "watchdog",
  NETWORK: "network",
  UNKNOWN: "unknown"
};

/**
 * Tipos de anomalia do watchdog
 * @enum {string}
 */
export const WATCHDOG_ANOMALY_TYPES = {
  NO_EVENTS_AFTER_CONNECT: "no_events_after_connect",
  IDLE_ANY_EVENT: "idle_any_event",
  IDLE_INTERACTIVE: "idle_interactive"
};

/**
 * Tipos de eventos TikTok Live
 * @enum {string}
 */
export const TIKTOK_EVENT_TYPES = {
  CHAT: "chat",
  GIFT: "gift",
  MEMBER: "member",
  FOLLOW: "follow",
  SHARE: "share",
  LIKE: "like",
  ROOM_USER: "roomUser",
  GOAL_UPDATE: "goalUpdate",
  POLL_MESSAGE: "pollMessage",
  LINK_MIC_BATTLE: "linkMicBattle",
  ROOM_PIN: "roomPin",
  QUIT: "quit",
  DISCONNECTED: "disconnected",
  STREAM_END: "streamEnd",
  ERROR: "error"
};

/**
 * Tipos de eventos interativos (excetuando roomUser)
 */
export const INTERACTIVE_EVENT_TYPES = new Set([
  TIKTOK_EVENT_TYPES.CHAT,
  TIKTOK_EVENT_TYPES.GIFT,
  TIKTOK_EVENT_TYPES.MEMBER,
  TIKTOK_EVENT_TYPES.FOLLOW,
  TIKTOK_EVENT_TYPES.SHARE,
  TIKTOK_EVENT_TYPES.LIKE,
  TIKTOK_EVENT_TYPES.GOAL_UPDATE,
  TIKTOK_EVENT_TYPES.POLL_MESSAGE,
  TIKTOK_EVENT_TYPES.LINK_MIC_BATTLE,
  TIKTOK_EVENT_TYPES.ROOM_PIN
]);

/**
 * Padrões regex para classificação de razões de desconexão
 */
export const DISCONNECT_REASON_PATTERNS = {
  [DISCONNECT_REASON_TYPES.RATE_LIMIT]: [
    "rate limited",
    "rate_limit",
    "too many connections"
  ],
  [DISCONNECT_REASON_TYPES.AUTH]: [
    "403",
    "401",
    "forbidden",
    "unauthorized"
  ],
  [DISCONNECT_REASON_TYPES.STREAM_END]: [
    "stream_end",
    "live ended"
  ],
  [DISCONNECT_REASON_TYPES.TIMEOUT]: [
    "timeout",
    "etimedout"
  ],
  [DISCONNECT_REASON_TYPES.OFFLINE]: [
    "room not found",
    "not active",
    "isn't online"
  ],
  [DISCONNECT_REASON_TYPES.WATCHDOG]: [
    "watchdog"
  ]
};

/**
 * Configurações padrão de reconnect
 */
export const DEFAULT_RECONNECT_CONFIG = {
  baseDelayMs: 1000,
  maxDelayMs: 120000,
  jitterMs: 1500,
  offlineDelayMs: 30000,
  streamEndDelayMs: 120000,
  authDelayMs: 600000,
  timeoutDelayMs: 15000,
  rateLimitDelayMs: 3600000
};

/**
 * Configurações padrão de circuit breaker
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  enabled: true,
  failureThreshold: 6,
  cooldownMs: 300000,
  // Se o circuito abrir esse número de vezes SEM que nenhum evento real
  // (chat/gift/member/etc) jamais tenha sido recebido para esse streamer,
  // entendemos que não é uma instabilidade passageira e sim um bloqueio
  // estrutural (sign key ausente/inválida, sessão ausente, IP do host
  // bloqueado pelo TikTok/Euler Stream, etc). Nesse caso paramos de tentar
  // sozinhos em vez de girar em loop 24/7 consumindo o servidor à toa.
  hardPauseAfterOpens: 5
};

/**
 * Configurações padrão de watchdog
 */
export const DEFAULT_WATCHDOG_CONFIG = {
  tickMs: 10000,
  noEventAfterConnectMs: 30000,
  idleAnyEventMs: 120000,
  idleInteractiveMs: 180000,
  minViewersForInteractiveWatch: 50
};

/**
 * Mensagens de log padrão
 */
export const LOG_MESSAGES = {
  CONNECTING: (streamer) => `🔗 Conectando em ${streamer}`,
  CONNECTED: (streamer, roomId) => `✅ Conectado em ${streamer} (Room: ${roomId})`,
  DISCONNECTING: (streamer, reason) => `🔌 Desconectando ${streamer}: ${reason}`,
  RECONNECTING: (streamer, reason) => `🔄 Reconectando ${streamer}: ${reason}`,
  CIRCUIT_OPEN: (streamer, failures) => `⚠️  Circuit breaker aberto em ${streamer} (${failures} falhas)`,
  WATCHDOG_TRIGGERED: (type, streamer) => `🚨 Watchdog ativado [${type}] em ${streamer}`,
  ERROR: (streamer, error) => `❌ Erro em ${streamer}: ${error}`
};
