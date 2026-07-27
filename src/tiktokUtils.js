/**
 * TikTok Live Connector - Utilitários
 */

import {
  DISCONNECT_REASON_TYPES,
  DISCONNECT_REASON_PATTERNS,
  INTERACTIVE_EVENT_TYPES
} from "./tiktokConstants.js";

/**
 * Classifica a razão de desconexão baseado na mensagem de erro
 * @param {string|Error} rawReason - A razão bruta do erro
 * @returns {string} Tipo de razão classificada
 */
export function classifyDisconnectReason(rawReason) {
  const message = String(rawReason || "").toLowerCase();
  
  if (!message) {
    return DISCONNECT_REASON_TYPES.UNKNOWN;
  }

  // Itera sobre os padrões definidos
  for (const [reasonType, patterns] of Object.entries(DISCONNECT_REASON_PATTERNS)) {
    if (patterns.some(pattern => message.includes(pattern.toLowerCase()))) {
      return reasonType;
    }
  }

  return DISCONNECT_REASON_TYPES.NETWORK;
}

/**
 * Extrai a contagem de espectadores dos dados do evento
 * @param {Object} data - Dados do evento
 * @returns {number|null} Contagem de espectadores ou null
 */
export function extractViewerCount(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const direct = Number(data.viewerCount);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  const roomUser = Number(data.roomUserCount);
  if (Number.isFinite(roomUser) && roomUser > 0) {
    return roomUser;
  }

  return null;
}

/**
 * Valida se um nome de streamer é válido
 * @param {string} streamer - Nome do streamer
 * @returns {boolean} True se válido
 */
export function isValidStreamer(streamer) {
  const str = String(streamer || "").trim();
  
  // Validações básicas
  if (str.length === 0 || str.length > 255) {
    return false;
  }
  
  // Apenas caracteres alfanuméricos, underscore, hífen, @, ponto
  // Sem caracteres especiais múltiplos consecutivos
  if (!/^[\w\-@.]+$/.test(str)) {
    return false;
  }
  
  // Não permitir múltiplos @ consecutivos
  if (str.includes("@@")) {
    return false;
  }
  
  // Não permitir múltiplos . ou - consecutivos
  if (str.includes("..") || str.includes("--")) {
    return false;
  }
  
  return true;
}

/**
 * Valida se um tipo de evento é interativo
 * @param {string} eventType - Tipo do evento
 * @returns {boolean} True se é evento interativo
 */
export function isInteractiveEvent(eventType) {
  return INTERACTIVE_EVENT_TYPES.has(String(eventType || ""));
}

/**
 * Calcula o delay de exponential backoff com jitter
 * @param {number} baseDelayMs - Delay base em ms
 * @param {number} attempt - Número da tentativa (começa em 0)
 * @param {number} maxDelayMs - Delay máximo em ms
 * @param {number} jitterMs - Jitter máximo em ms
 * @returns {number} Delay calculado em ms
 */
export function calculateExponentialBackoff(
  baseDelayMs = 1000,
  attempt = 0,
  maxDelayMs = 120000,
  jitterMs = 1500
) {
  if (attempt < 0) attempt = 0;
  
  const exponential = baseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const capped = Math.min(maxDelayMs, exponential);
  const jitter = Math.floor(Math.random() * jitterMs);
  
  return Math.max(baseDelayMs, capped + jitter);
}

/**
 * Normaliza texto removendo espaços extras
 * @param {string} text - Texto a normalizar
 * @returns {string} Texto normalizado
 */
export function normalizeText(text) {
  return String(text || "").trim().replace(/\s+/g, " ");
}

/**
 * Extrai o identificador do usuário de um evento do TikTok Live.
 *
 * A partir do tiktok-live-connector 2.x, os dados do usuário vêm aninhados em
 * `data.user` (data.user.uniqueId / data.user.nickname), diferente da API antiga
 * que expunha `data.uniqueId` direto na raiz do evento. Mantemos o fallback para
 * o formato antigo por robustez, já que foi essa mudança de formato que fazia os
 * nomes de usuário sumirem nos eventos (chat, gift, member, follow, share, like).
 * @param {Object} data - Dados brutos do evento
 * @returns {string|null} uniqueId (ou nickname como fallback) do usuário
 */
export function extractUser(data) {
  if (!data || typeof data !== "object") return null;
  return (
    data.user?.uniqueId ||
    data.uniqueId ||
    data.user?.nickname ||
    data.nickname ||
    null
  );
}

/**
 * Converte objeto de opções para formato padrão com fallbacks
 * @param {Object} customOptions - Opções customizadas
 * @param {Object} defaults - Valores padrão
 * @returns {Object} Opções mescladas
 */
export function mergeOptions(customOptions = {}, defaults = {}) {
  if (typeof customOptions !== "object" || customOptions === null) {
    return { ...defaults };
  }

  return {
    ...defaults,
    ...Object.fromEntries(
      Object.entries(customOptions).filter(([_, v]) => v !== undefined && v !== null)
    )
  };
}

/**
 * Cria um UUID simples para rastreamento de sessão
 * @returns {string} UUID simples
 */
export function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Formata timestamp para ISO string
 * @returns {string} ISO timestamp atual
 */
export function isoNow() {
  return new Date().toISOString();
}

/**
 * Valida se um valor é um número finito válido
 * @param {*} value - Valor a validar
 * @param {*} fallback - Valor padrão se inválido
 * @returns {number|*} Número válido ou fallback
 */
export function numValue(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Limpa um timer de forma segura
 * @param {number} timerId - ID do timer
 * @returns {void}
 */
export function safeClearTimeout(timerId) {
  if (timerId) {
    clearTimeout(timerId);
  }
}

/**
 * Limpa um interval de forma segura
 * @param {number} intervalId - ID do interval
 * @returns {void}
 */
export function safeClearInterval(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
  }
}

/**
 * Cria um logger com contexto de streamer
 * @param {string} streamer - Nome do streamer para contexto
 * @param {Object} options - Opções de logger
 * @returns {Object} Logger com métodos info, warn, error
 */
export function createStreamerLogger(streamer, options = {}) {
  const prefix = `[${streamer}]`;
  const { enabled = true } = options;

  if (!enabled) {
    return {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    };
  }

  return {
    info: (msg) => console.log(`ℹ️  ${prefix} ${msg}`),
    warn: (msg) => console.warn(`⚠️  ${prefix} ${msg}`),
    error: (msg) => console.error(`❌ ${prefix} ${msg}`),
    debug: (msg) => process.env.DEBUG && console.debug(`🐛 ${prefix} ${msg}`)
  };
}
