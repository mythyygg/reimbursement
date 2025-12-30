import { config } from "../config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogPayload = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const REDACT_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "token",
  "secret",
  "access_token",
  "refresh_token",
];

function shouldRedact(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACT_KEYS.some((entry) => normalized.includes(entry));
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = shouldRedact(key) ? "[REDACTED]" : redact(entry);
    }
    return output;
  }
  return value;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[config.logLevel];
}

function emit(level: LogLevel, message: string, payload?: LogPayload) {
  if (!shouldLog(level)) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...payload,
  };

  const serialized = JSON.stringify(redact(entry));

  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

function serializeError(error: unknown): LogPayload {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { error };
}

export function logDebug(message: string, payload?: LogPayload) {
  emit("debug", message, payload);
}

export function logInfo(message: string, payload?: LogPayload) {
  emit("info", message, payload);
}

export function logWarn(message: string, payload?: LogPayload) {
  emit("warn", message, payload);
}

export function logError(message: string, error?: unknown, payload?: LogPayload) {
  const errorPayload = error ? serializeError(error) : {};
  emit("error", message, { ...errorPayload, ...payload });
}
