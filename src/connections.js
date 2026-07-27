/**
 * TikTok Live Connection Manager - Refatorado
 * Gerencia múltiplas conexões simultâneas com reconexão automática,
 * circuit breaker, e watchdog para anomalias.
 */

import { TikTokLiveConnection } from "tiktok-live-connector";
import {
  DISCONNECT_REASON_TYPES,
  TIKTOK_EVENT_TYPES,
  INTERACTIVE_EVENT_TYPES,
  DEFAULT_RECONNECT_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_WATCHDOG_CONFIG,
  WATCHDOG_ANOMALY_TYPES
} from "./tiktokConstants.js";
import {
  classifyDisconnectReason,
  extractViewerCount,
  isValidStreamer,
  isInteractiveEvent,
  calculateExponentialBackoff,
  createStreamerLogger
} from "./tiktokUtils.js";

/**
 * @typedef {Object} ConnectionState
 * @property {string} streamer - Nome único do streamer
 * @property {TikTokLiveConnection|null} conn - Instância de conexão
 * @property {boolean} connected - Status de conexão
 * @property {boolean} connecting - Status de conexão em andamento
 * @property {boolean} paused - Status de pausa
 * @property {boolean} manualClose - Indicador de fechamento manual
 * @property {string|null} roomId - ID da sala
 * @property {number} connectedAt - Timestamp de conexão
 * @property {number} lastAnyEventTs - Timestamp do último evento
 * @property {number} lastInteractiveEventTs - Timestamp do último evento interativo
 * @property {number} lastViewerCount - Contagem de espectadores
 * @property {number} eventsSinceConnect - Eventos desde conexão
 * @property {boolean} sawAnyEventSinceConnect - Marcador de evento recebido
 * @property {number} reconnectAttempts - Tentativas de reconexão
 * @property {number|null} reconnectTimer - ID do timer de reconexão
 * @property {number|null} watchdogTimer - ID do interval do watchdog
 * @property {number|null} circuitTimer - ID do timer do circuit breaker
 * @property {number} consecutiveFailures - Falhas consecutivas
 * @property {number} circuitOpenUntil - Timestamp até quando circuit está aberto
 * @property {string|null} lastDisconnectReason - Última razão de desconexão
 * @property {Object} logger - Logger do streamer
 */

/**
 * @typedef {Object} ConnectionManagerOptions
 * @property {Function} onEvent - Callback de evento
 * @property {Function} onConnect - Callback de conexão
 * @property {Function} onDisconnect - Callback de desconexão
 * @property {Function} onError - Callback de erro
 * @property {Function} onCircuitOpen - Callback de circuit breaker aberto
 * @property {Function} onWatchdogAnomaly - Callback de anomalia do watchdog
 * @property {Function} signApiKeyProvider - Provider de chave de assinatura
 * @property {Function} headersProvider - Provider de headers HTTP
 * @property {Function} optionsProvider - Provider de opções de conexão
 * @property {boolean} logEnabled - Ativar logging
 */

/**
 * Cria um gerenciador de conexão para TikTok Live
 * @param {Partial<ConnectionManagerOptions>} options - Opções de configuração
 * @returns {Object} API do gerenciador
 */
export function createConnectionManager(options = {}) {
  const {
    onEvent,
    onConnect,
    onDisconnect,
    onError,
    onCircuitOpen,
    onWatchdogAnomaly,
    onHardPause,
    signApiKeyProvider,
    headersProvider,
    optionsProvider,
    logEnabled = true
  } = options;

  /** @type {Map<string, ConnectionState>} */
  const connections = new Map();

  // ==================== VALIDAÇÃO E LOGGING ====================

  /**
   * Valida e retorna logger para streamer
   */
  function getLogger(streamer) {
    if (!logEnabled) {
      return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
    }
    return createStreamerLogger(streamer, { enabled: true });
  }

  /**
   * Valida nome do streamer
   */
  function validateStreamer(streamer) {
    if (!isValidStreamer(streamer)) {
      throw new Error(`Nome de streamer inválido: "${streamer}"`);
    }
  }

  // ==================== CONFIGURAÇÃO ====================

  /**
   * Mescla opções customizadas com padrões
   */
  function getOptions(streamer) {
    const custom = typeof optionsProvider === "function" 
      ? (optionsProvider(streamer) || {}) 
      : {};

    return {
      reconnect: {
        ...DEFAULT_RECONNECT_CONFIG,
        ...custom.reconnect
      },
      circuitBreaker: {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        ...custom.circuitBreaker
      },
      watchdog: {
        ...DEFAULT_WATCHDOG_CONFIG,
        ...custom.watchdog
      },
      webTimeoutMs: custom.webTimeoutMs ?? null,
      wsTimeoutMs: custom.wsTimeoutMs ?? null,
      sessionId: custom.sessionId ?? null,
      ttTargetIdc: custom.ttTargetIdc ?? null,
      // Desligado por padrão: com enableExtendedGiftInfo=true, a lib faz um fetch
      // automático do catálogo de presentes da sala (fetchAvailableGifts) via
      // Euler Stream. Esse endpoint hoje exige plano pago lá ("This endpoint
      // requires a Business plan") e, sem uma signApiKey paga, derruba a conexão
      // inteira com SignatureMissingTokensError antes mesmo do WebSocket abrir.
      // O nome do gift ainda é resolvido no index.js via fallback (data.giftName /
      // data.gift.name) mesmo sem essa info estendida. Só habilite se tiver uma
      // signApiKey com plano que cubra esse endpoint.
      enableExtendedGiftInfo: custom.enableExtendedGiftInfo ?? false
    };
  }

  // ==================== GERENCIAMENTO DE ESTADO ====================

  /**
   * Cria estado inicial para streamer
   */
  function createState(streamer) {
    return {
      streamer,
      conn: null,
      connected: false,
      connecting: false,
      paused: false,
      manualClose: false,
      roomId: null,

      connectedAt: 0,
      lastAnyEventTs: 0,
      lastInteractiveEventTs: 0,
      lastViewerCount: 0,
      eventsSinceConnect: 0,
      sawAnyEventSinceConnect: false,

      reconnectAttempts: 0,
      reconnectTimer: null,
      watchdogTimer: null,
      circuitTimer: null,
      consecutiveFailures: 0,
      circuitOpenUntil: 0,
      lastDisconnectReason: null,

      // Quantas vezes o circuit breaker já abriu para esse streamer, e se
      // ALGUM evento real (chat/gift/member/etc) já foi recebido desde que
      // o processo subiu. Usados para detectar "conecta mas nunca recebe
      // nada" e parar de tentar sozinho em vez de girar para sempre.
      circuitOpenCount: 0,
      everSawEvent: false,
      hardPaused: false,

      logger: getLogger(streamer)
    };
  }

  /**
   * Obtém ou cria estado para streamer
   */
  function getState(streamer) {
    if (!connections.has(streamer)) {
      connections.set(streamer, createState(streamer));
    }
    return connections.get(streamer);
  }

  /**
   * Reseta estado de eventos
   */
  function resetEventState(state) {
    state.eventsSinceConnect = 0;
    state.sawAnyEventSinceConnect = false;
    state.lastAnyEventTs = 0;
    state.lastInteractiveEventTs = 0;
  }

  /**
   * Reseta estado de reconexão e circuit breaker por completo.
   * Usado apenas em ações explícitas do operador (resume, clearCircuit,
   * forceReconnect) — NÃO deve ser chamado automaticamente a cada handshake
   * bem-sucedido, senão um streamer que conecta mas nunca recebe eventos
   * nunca deixa o circuit breaker abrir de verdade (loop infinito).
   */
  function resetReconnectState(state) {
    state.reconnectAttempts = 0;
    state.consecutiveFailures = 0;
    state.circuitOpenUntil = 0;
    state.circuitOpenCount = 0;
  }

  /**
   * Reseta apenas o contador de tentativas de reconexão (backoff exponencial).
   * Chamado quando o handshake TCP/WS teve sucesso — mas NÃO significa que a
   * conexão está de fato saudável (isso só é confirmado quando um evento real
   * chega, ver handleEvent). consecutiveFailures/circuitOpenCount continuam
   * de pé até recebermos algo, para o circuit breaker conseguir detectar
   * "conecta só na aparência, nunca funciona de verdade".
   */
  function resetBackoffOnly(state) {
    state.reconnectAttempts = 0;
  }

  // ==================== TIMERS ====================

  /**
   * Limpa timer de forma segura
   */
  function clearTimer(state, key) {
    if (state[key]) {
      clearTimeout(state[key]);
      state[key] = null;
    }
  }

  /**
   * Para watchdog
   */
  function stopWatchdog(state) {
    if (state.watchdogTimer) {
      clearInterval(state.watchdogTimer);
      state.watchdogTimer = null;
    }
  }

  /**
   * Limpa todos os timers
   */
  function clearAllTimers(state) {
    clearTimer(state, "reconnectTimer");
    clearTimer(state, "circuitTimer");
    stopWatchdog(state);
  }

  // ==================== RECONEXÃO ====================

  /**
   * Calcula delay de reconexão baseado na razão
   */
  function computeReconnectDelay(streamer, reason) {
    const state = getState(streamer);
    const opts = getOptions(streamer).reconnect;
    const reasonType = classifyDisconnectReason(reason);

    switch (reasonType) {
      case DISCONNECT_REASON_TYPES.RATE_LIMIT:
        return opts.rateLimitDelayMs;
      case DISCONNECT_REASON_TYPES.AUTH:
        return opts.authDelayMs;
      case DISCONNECT_REASON_TYPES.STREAM_END:
        return opts.streamEndDelayMs;
      case DISCONNECT_REASON_TYPES.OFFLINE:
        return opts.offlineDelayMs;
      case DISCONNECT_REASON_TYPES.TIMEOUT:
        return opts.timeoutDelayMs;
      default:
        return calculateExponentialBackoff(
          opts.baseDelayMs,
          state.reconnectAttempts,
          opts.maxDelayMs,
          opts.jitterMs
        );
    }
  }

  /**
   * Agenda reconexão
   */
  function scheduleReconnect(streamer, reason = DISCONNECT_REASON_TYPES.UNKNOWN) {
    const state = getState(streamer);
    const opts = getOptions(streamer);
    const now = Date.now();

    if (state.manualClose || state.paused || state.reconnectTimer) {
      return;
    }

    // Verifica se circuit breaker está aberto
    if (state.circuitOpenUntil && state.circuitOpenUntil > now) {
      const waitMs = state.circuitOpenUntil - now;
      state.logger.warn(`Aguardando ${(waitMs / 1000).toFixed(1)}s para circuit breaker resetar`);
      
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        connect(streamer);
      }, waitMs);
      return;
    }

    // Incrementa tentativas e calcula delay
    state.reconnectAttempts += 1;
    const delay = computeReconnectDelay(streamer, reason);

    // Verifica se deve abrir circuit breaker
    const cb = opts.circuitBreaker;
    if (cb.enabled && state.consecutiveFailures >= cb.failureThreshold) {
      state.circuitOpenUntil = now + cb.cooldownMs;
      state.circuitOpenCount += 1;
      clearTimer(state, "reconnectTimer");
      clearTimer(state, "circuitTimer");

      state.logger.warn(
        `🔓 Circuit breaker aberto (${state.consecutiveFailures} falhas consecutivas, abertura #${state.circuitOpenCount}) por ${(cb.cooldownMs / 1000).toFixed(0)}s`
      );

      if (typeof onCircuitOpen === "function") {
        onCircuitOpen(streamer, {
          failures: state.consecutiveFailures,
          cooldownMs: cb.cooldownMs,
          circuitOpenCount: state.circuitOpenCount,
          reason
        });
      }

      // Válvula de segurança: se o circuito já abriu várias vezes seguidas e
      // NUNCA recebemos um evento real desse streamer, não é uma
      // instabilidade passageira — é um bloqueio estrutural (sign key
      // ausente/inválida, sessão ausente, IP do host bloqueado pelo
      // TikTok/Euler Stream, etc). Continuar tentando 24/7 só consome CPU,
      // rede e as horas do plano do host sem nenhuma chance real de dar
      // certo sozinho. Pausamos e avisamos claramente em vez disso.
      const hardPauseAfter = cb.hardPauseAfterOpens;
      if (
        Number.isFinite(hardPauseAfter) &&
        hardPauseAfter > 0 &&
        !state.everSawEvent &&
        state.circuitOpenCount >= hardPauseAfter
      ) {
        state.hardPaused = true;
        state.paused = true;
        state.manualClose = true;
        clearTimer(state, "circuitTimer");

        state.logger.error(
          `⛔ Pausa automática: circuito abriu ${state.circuitOpenCount}x sem NENHUM evento recebido. ` +
          "Provável causa: TIKTOK_SIGN_API_KEY/TIKTOK_SESSIONID ausentes ou inválidos, ou o IP deste servidor " +
          "está sendo limitado/bloqueado pelo TikTok/Euler Stream. Revise as variáveis de ambiente antes de retomar " +
          "(use resume() ou POST /api/streamers/:name/resume no dashboard)."
        );

        if (typeof onHardPause === "function") {
          onHardPause(streamer, {
            circuitOpenCount: state.circuitOpenCount,
            reason
          });
        }
        return;
      }

      state.circuitTimer = setTimeout(() => {
        state.circuitTimer = null;
        state.logger.info("🔓 Circuit breaker resetado");
        connect(streamer);
      }, cb.cooldownMs);
      return;
    }

    // Agenda reconexão normal
    state.logger.info(
      `Reconectando em ${(delay / 1000).toFixed(1)}s (tentativa ${state.reconnectAttempts})`
    );

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect(streamer);
    }, delay);
  }

  // ==================== WATCHDOG ====================

  /**
   * Inicia watchdog de anomalias
   */
  function startWatchdog(streamer) {
    const state = getState(streamer);
    const opts = getOptions(streamer).watchdog;

    stopWatchdog(state);

    state.watchdogTimer = setInterval(() => {
      if (!state.connected) return;

      const now = Date.now();
      const sinceConnect = now - (state.connectedAt || now);
      const idleAny = now - (state.lastAnyEventTs || state.connectedAt || now);
      const idleInteractive = now - (state.lastInteractiveEventTs || state.connectedAt || now);

      // Nenhum evento após conexão
      if (!state.sawAnyEventSinceConnect && sinceConnect > opts.noEventAfterConnectMs) {
        state.logger.warn(
          `🚨 Nenhum evento após ${(sinceConnect / 1000).toFixed(0)}s de conexão`
        );

        if (typeof onWatchdogAnomaly === "function") {
          onWatchdogAnomaly(streamer, {
            type: WATCHDOG_ANOMALY_TYPES.NO_EVENTS_AFTER_CONNECT,
            sinceConnectMs: sinceConnect
          });
        }

        reconnect(streamer, "watchdog_no_events");
        return;
      }

      // Inativo em qualquer evento
      if (idleAny > opts.idleAnyEventMs) {
        state.logger.warn(
          `🚨 Inativo por ${(idleAny / 1000).toFixed(0)}s (qualquer evento)`
        );

        if (typeof onWatchdogAnomaly === "function") {
          onWatchdogAnomaly(streamer, {
            type: WATCHDOG_ANOMALY_TYPES.IDLE_ANY_EVENT,
            idleMs: idleAny
          });
        }

        reconnect(streamer, "watchdog_idle_any_event");
        return;
      }

      // Inativo em evento interativo (apenas se há viewers suficientes)
      if (
        state.lastViewerCount >= opts.minViewersForInteractiveWatch &&
        idleInteractive > opts.idleInteractiveMs
      ) {
        state.logger.warn(
          `🚨 Inativo por ${(idleInteractive / 1000).toFixed(0)}s (evento interativo, ${state.lastViewerCount} viewers)`
        );

        if (typeof onWatchdogAnomaly === "function") {
          onWatchdogAnomaly(streamer, {
            type: WATCHDOG_ANOMALY_TYPES.IDLE_INTERACTIVE,
            idleMs: idleInteractive,
            viewers: state.lastViewerCount
          });
        }

        reconnect(streamer, "watchdog_idle_interactive");
      }
    }, opts.tickMs);
  }

  // ==================== LISTENERS DE EVENTOS ====================

  /**
   * Registra todos os listeners de eventos da conexão
   */
  function registerEventListeners(streamer, conn) {
    const handleEventWrapper = (type) => (data) => {
      handleEvent(streamer, type, data);
    };

    // Eventos de conexão
    conn.on("connected", (connectedState) => {
      handleConnected(streamer, connectedState?.roomId);
    });
    conn.on("disconnected", () => {
      handleDisconnect(streamer, DISCONNECT_REASON_TYPES.UNKNOWN);
    });
    conn.on("streamEnd", () => {
      handleDisconnect(streamer, DISCONNECT_REASON_TYPES.STREAM_END);
    });
    conn.on("error", (err) => {
      if (typeof onError === "function") {
        onError(streamer, err);
      }
      handleDisconnect(streamer, err?.message || "error");
    });

    // Eventos do TikTok
    conn.on("chat", handleEventWrapper(TIKTOK_EVENT_TYPES.CHAT));
    conn.on("gift", handleEventWrapper(TIKTOK_EVENT_TYPES.GIFT));
    conn.on("member", handleEventWrapper(TIKTOK_EVENT_TYPES.MEMBER));
    conn.on("follow", handleEventWrapper(TIKTOK_EVENT_TYPES.FOLLOW));
    conn.on("share", handleEventWrapper(TIKTOK_EVENT_TYPES.SHARE));
    conn.on("like", handleEventWrapper(TIKTOK_EVENT_TYPES.LIKE));
    conn.on("roomUser", handleEventWrapper(TIKTOK_EVENT_TYPES.ROOM_USER));
    conn.on("goalUpdate", handleEventWrapper(TIKTOK_EVENT_TYPES.GOAL_UPDATE));
    conn.on("pollMessage", handleEventWrapper(TIKTOK_EVENT_TYPES.POLL_MESSAGE));
    conn.on("linkMicBattle", handleEventWrapper(TIKTOK_EVENT_TYPES.LINK_MIC_BATTLE));
    conn.on("roomPin", handleEventWrapper(TIKTOK_EVENT_TYPES.ROOM_PIN));
  }

  // ==================== TRATAMENTO DE EVENTOS ====================

  /**
   * Trata conectado com sucesso
   */
  function handleConnected(streamer, roomId = null) {
    const state = getState(streamer);
    const now = Date.now();

    state.connected = true;
    state.connecting = false;
    state.roomId = roomId ?? null;
    state.connectedAt = now;

    resetBackoffOnly(state);
    resetEventState(state);

    state.lastAnyEventTs = now;
    state.lastInteractiveEventTs = now;

    state.logger.info(`✅ Conectado (Room: ${roomId})`);

    startWatchdog(streamer);

    if (typeof onConnect === "function") {
      onConnect(streamer, roomId);
    }
  }

  /**
   * Trata desconexão
   */
  function handleDisconnect(streamer, reason = DISCONNECT_REASON_TYPES.UNKNOWN) {
    const state = getState(streamer);
    const wasManualClose = state.manualClose;
    state.manualClose = false;

    const wasConnected = state.connected;
    state.connected = false;
    state.connecting = false;
    state.roomId = null;
    state.lastDisconnectReason = reason;

    stopWatchdog(state);
    resetEventState(state);

    const reasonType = classifyDisconnectReason(reason);
    state.logger.warn(`Desconectado [${reasonType}]: ${reason}`);

    if (typeof onDisconnect === "function" && wasConnected) {
      onDisconnect(streamer, reason);
    }

    if (wasManualClose) {
      return;
    }

    state.consecutiveFailures += 1;
    scheduleReconnect(streamer, reason);
  }

  /**
   * Trata evento recebido
   */
  function handleEvent(streamer, type, data) {
    const state = getState(streamer);
    const now = Date.now();

    // Primeiro evento real recebido desde o connect: agora sim a conexão
    // está comprovadamente saudável. Zera os contadores de falha/circuito
    // (isso é seguro aqui porque, ao contrário do handshake, um evento real
    // só chega se o TikTok estiver de fato entregando dados).
    if (!state.sawAnyEventSinceConnect) {
      state.everSawEvent = true;
      state.consecutiveFailures = 0;
      state.circuitOpenCount = 0;
    }

    state.lastAnyEventTs = now;
    state.sawAnyEventSinceConnect = true;
    state.eventsSinceConnect += 1;

    // Atualiza timestamp de evento interativo
    if (isInteractiveEvent(type)) {
      state.lastInteractiveEventTs = now;
    }

    // Atualiza contagem de espectadores
    if (type === TIKTOK_EVENT_TYPES.ROOM_USER) {
      const viewers = extractViewerCount(data);
      if (viewers !== null) {
        state.lastViewerCount = viewers;
      }
    }

    if (typeof onEvent === "function") {
      onEvent(streamer, type, data);
    }
  }

  // ==================== CONFIGURAÇÃO DE CONEXÃO ====================

  /**
   * Cria instância de TikTokLiveConnection
   */
  function createWebcastConnection(streamer) {
    const opts = getOptions(streamer);
    const headers = typeof headersProvider === "function"
      ? (headersProvider(streamer) || {})
      : {};
    const signApiKey = typeof signApiKeyProvider === "function"
      ? signApiKeyProvider(streamer)
      : null;

    const sessionId = opts.sessionId ?? null;
    const ttTargetIdc = opts.ttTargetIdc ?? null;
    const canUseSession = !!(sessionId && ttTargetIdc);

    // A partir do tiktok-live-connector 2.x estável (API real, confirmada na doc oficial):
    // - sessionId/ttTargetIdc vão dentro de session.cookie.value (com type: "cookie"),
    //   nunca soltos na raiz da config.
    // - Headers customizados (user-agent, etc) vão em webClientOptions/wsClientOptions
    //   (opções reais do "got"/"ws"), não em requestOptions/websocketHeaders/
    //   webClientHeaders/wsClientHeaders, que são nomes da API antiga (WebcastPushConnection)
    //   e não existem mais na classe TikTokLiveConnection.
    // - enableWebsocketUpgrade e disableEulerFallbacks também são opções da API antiga;
    //   não existem na TikTokLiveConnection e eram apenas dead code.
    const webClientOptions = {};
    const wsClientOptions = {};
    if (Object.keys(headers).length > 0) {
      webClientOptions.headers = headers;
      wsClientOptions.headers = headers;
    }
    if (Number.isFinite(opts.webTimeoutMs) && opts.webTimeoutMs > 0) {
      webClientOptions.timeout = opts.webTimeoutMs;
    }
    if (Number.isFinite(opts.wsTimeoutMs) && opts.wsTimeoutMs > 0) {
      wsClientOptions.timeout = opts.wsTimeoutMs;
    }

    const connectionConfig = {
      enableExtendedGiftInfo: opts.enableExtendedGiftInfo,
      ...(signApiKey ? { signApiKey } : {}),
      ...(canUseSession
        ? {
            session: {
              cookie: {
                type: "cookie",
                value: { sessionId, ttTargetIdc }
              }
            },
            authenticateWs: true
          }
        : {}),
      ...(Object.keys(webClientOptions).length ? { webClientOptions } : {}),
      ...(Object.keys(wsClientOptions).length ? { wsClientOptions } : {})
    };

    return new TikTokLiveConnection(streamer, connectionConfig);
  }

  // ==================== API PÚBLICA ====================

  /**
   * Conecta a um streamer
   */
  async function connect(streamer) {
    validateStreamer(streamer);
    const state = getState(streamer);

    if (state.paused) {
      state.logger.warn("Conexão pausada");
      return;
    }

    if (state.connected || state.connecting) {
      state.logger.debug("Já conectado ou conectando");
      return;
    }

    state.connecting = true;
    state.manualClose = false;
    clearAllTimers(state);

    try {
      state.logger.info("🔗 Conectando...");

      const conn = createWebcastConnection(streamer);
      state.conn = conn;

      registerEventListeners(streamer, conn);

      await conn.connect();
      // handleConnected é chamado pelo listener "connected"
    } catch (err) {
      state.logger.error(`Erro na conexão: ${err.message}`);
      state.connecting = false;

      if (typeof onError === "function") {
        onError(streamer, err);
      }

      state.consecutiveFailures += 1;
      scheduleReconnect(streamer, err?.message || "connect_error");
    }
  }

  /**
   * Desconecta e reconecta
   */
  function reconnect(streamer, reason = "manual_reconnect") {
    validateStreamer(streamer);
    const state = getState(streamer);

    if (state.paused) {
      state.logger.warn("Reconexão pausada (em pausa)");
      return;
    }

    const wasConnected = state.connected || state.connecting;

    state.logger.info(`🔄 Reconectando: ${reason}`);
    stopWatchdog(state);
    clearAllTimers(state);

    state.connected = false;
    state.connecting = false;
    state.roomId = null;
    state.lastDisconnectReason = reason;
    resetEventState(state);

    // reconnect() é chamado tanto pelo watchdog (ex: "conectou mas não
    // recebeu nenhum evento em 30s") quanto por forceReconnect(). Isso conta
    // como falha para efeito de circuit breaker — do contrário um streamer
    // que sempre completa o handshake mas nunca entrega eventos reconectaria
    // para sempre a cada ~30s sem o circuito nunca abrir.
    state.consecutiveFailures += 1;

    try {
      if (state.conn) {
        state.conn.removeAllListeners();
        state.conn.disconnect();
      }
    } catch {}
    state.conn = null;

    if (wasConnected && typeof onDisconnect === "function") {
      onDisconnect(streamer, reason);
    }

    scheduleReconnect(streamer, reason);
  }

  /**
   * Desconecta permanentemente
   */
  function disconnect(streamer) {
    validateStreamer(streamer);
    const state = getState(streamer);

    state.logger.info("🔌 Desconectando permanentemente");
    
    stopWatchdog(state);
    clearAllTimers(state);
    state.manualClose = true;

    try {
      if (state.conn) {
        state.conn.removeAllListeners();
        state.conn.disconnect();
      }
    } catch {}

    state.conn = null;
    connections.delete(streamer);
  }

  /**
   * Pausa reconexões automáticas
   */
  function pause(streamer) {
    validateStreamer(streamer);
    const state = getState(streamer);

    state.logger.info("⏸️  Pausando");
    state.paused = true;

    stopWatchdog(state);
    clearAllTimers(state);
    state.manualClose = true;

    try {
      if (state.conn) {
        state.conn.removeAllListeners();
        state.conn.disconnect();
      }
    } catch {}

    state.connected = false;
    state.connecting = false;
    state.roomId = null;
    state.conn = null;
  }

  /**
   * Retoma após pausa
   */
  function resume(streamer) {
    validateStreamer(streamer);
    const state = getState(streamer);

    state.logger.info("▶️  Resumindo");
    state.paused = false;
    state.manualClose = false;
    state.hardPaused = false;
    state.circuitOpenCount = 0;
    state.consecutiveFailures = 0;
    state.circuitOpenUntil = 0;

    connect(streamer);
  }

  /**
   * Força reconexão imediata
   */
  function forceReconnect(streamer) {
    validateStreamer(streamer);
    const state = getState(streamer);

    if (state.paused) {
      state.logger.warn("Reconexão forçada cancelada (em pausa)");
      return;
    }

    state.logger.info("⚡ Forçando reconexão");

    state.circuitOpenUntil = 0;
    state.consecutiveFailures = 0;
    clearAllTimers(state);

    reconnect(streamer, "force_reconnect");
  }

  /**
   * Reseta circuit breaker
   */
  function clearCircuit(streamer) {
    validateStreamer(streamer);
    const state = getState(streamer);

    state.logger.info("🔓 Resetando circuit breaker");
    state.circuitOpenUntil = 0;
    state.consecutiveFailures = 0;
    state.circuitOpenCount = 0;
    clearTimer(state, "circuitTimer");
    clearTimer(state, "reconnectTimer");
  }

  /**
   * Obtém status atual de um streamer
   */
  function getStatus(streamer) {
    validateStreamer(streamer);
    const state = getState(streamer);

    return {
      streamer: state.streamer,
      connected: state.connected,
      connecting: state.connecting,
      paused: state.paused,
      roomId: state.roomId,
      reconnectAttempts: state.reconnectAttempts,
      consecutiveFailures: state.consecutiveFailures,
      circuitOpenUntil: state.circuitOpenUntil || null,
      circuitOpen: state.circuitOpenUntil > Date.now(),
      circuitOpenCount: state.circuitOpenCount || 0,
      everSawEvent: !!state.everSawEvent,
      hardPaused: !!state.hardPaused,
      lastDisconnectReason: state.lastDisconnectReason,
      connectedAt: state.connectedAt || null,
      connectedSinceMs: state.connected ? Date.now() - state.connectedAt : null,
      lastAnyEventTs: state.lastAnyEventTs || null,
      lastInteractiveEventTs: state.lastInteractiveEventTs || null,
      lastViewerCount: state.lastViewerCount || 0,
      eventsSinceConnect: state.eventsSinceConnect || 0
    };
  }

  /**
   * Obtém status de todos os streamers
   */
  function getAllStatus() {
    const statuses = {};
    for (const [streamer] of connections) {
      statuses[streamer] = getStatus(streamer);
    }
    return statuses;
  }

  /**
   * Obtém lista de streamers conectados
   */
  function getConnectedStreamers() {
    return Array.from(connections.values())
      .filter(state => state.connected)
      .map(state => state.streamer);
  }

  /**
   * Cleanup e encerramento
   */
  function shutdown() {
    console.log("🛑 Encerrando gerenciador de conexões...");
    
    for (const [streamer] of connections) {
      try {
        disconnect(streamer);
      } catch {}
    }

    connections.clear();
    console.log("✅ Gerenciador de conexões encerrado");
  }

  // ==================== RETORNO DA API ====================

  return {
    connect,
    disconnect,
    reconnect,
    pause,
    resume,
    forceReconnect,
    clearCircuit,
    getStatus,
    getAllStatus,
    getConnectedStreamers,
    shutdown
  };
}
