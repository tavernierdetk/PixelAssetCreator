import pino, { LoggerOptions } from "pino";

export function createLogger(name: string, opts: LoggerOptions = {}) {
  const pretty = process.env.NODE_ENV !== "production";
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
    ...(pretty
      ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } } }
      : {}),
    ...opts,
  });
}
