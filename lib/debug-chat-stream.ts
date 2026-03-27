type DebugFields = Record<string, unknown>;

function isDebugEnabled() {
  if (process.env.DEBUG_CHAT_STREAM === "1") {
    return true;
  }

  if (process.env.DEBUG_CHAT_STREAM === "0") {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

export function logDebug(prefix: string, event: string, fields?: DebugFields) {
  if (!isDebugEnabled()) {
    return;
  }

  if (fields && Object.keys(fields).length > 0) {
    console.log(`${prefix} ${event}`, fields);
    return;
  }

  console.log(`${prefix} ${event}`);
}

export function previewText(value: string, max = 80) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}...`;
}

export function previewValue(value: unknown, max = 200) {
  if (typeof value === "string") {
    return previewText(value, max);
  }

  try {
    return previewText(JSON.stringify(value), max);
  } catch {
    return String(value);
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function errorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  return {
    name: error.name,
    message: error.message,
    cause: error.cause ? previewValue(error.cause) : undefined,
  };
}
