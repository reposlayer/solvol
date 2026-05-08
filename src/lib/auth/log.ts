type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, msg: string, fields: Record<string, unknown> = {}) {
  const payload = {
    level,
    msg,
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
