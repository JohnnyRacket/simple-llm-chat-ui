declare global {
  // eslint-disable-next-line no-var
  var _abortRegistry: Map<string, AbortController> | undefined;
}

const registry: Map<string, AbortController> =
  process.env.NODE_ENV === "production"
    ? new Map()
    : (globalThis._abortRegistry ??= new Map());

export function registerAbort(chatId: string, controller: AbortController) {
  registry.set(chatId, controller);
}

export function getAbort(chatId: string): AbortController | undefined {
  return registry.get(chatId);
}

export function removeAbort(chatId: string) {
  registry.delete(chatId);
}
