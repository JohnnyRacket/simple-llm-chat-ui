import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";

// globalThis singleton for dev HMR, same pattern as lib/db/index.ts
declare global {
  // eslint-disable-next-line no-var
  var _streamContext: ReturnType<typeof createResumableStreamContext> | undefined;
}

function createContext() {
  return createResumableStreamContext({ waitUntil: after });
}

export const streamContext =
  process.env.NODE_ENV === "production"
    ? createContext()
    : (globalThis._streamContext ??= createContext());
