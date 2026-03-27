"use client";

import { useCallback, useEffect, useRef } from "react";
import type { UIMessage } from "ai";

const RESUME_COOLDOWN_MS = 5_000;
const STALLED_RESUME_AFTER_MS = 4_000;
const STALL_CHECK_INTERVAL_MS = 5_000;

type RecoverableStatus = "submitted" | "streaming" | "error" | "ready";

function isRecoverableStatus(status: RecoverableStatus) {
  return status === "submitted" || status === "streaming" || status === "error";
}

export function useChatRecovery<T extends UIMessage>({
  messages,
  status,
  resumeStream,
  finalizeStream,
}: {
  messages: T[];
  status: RecoverableStatus;
  resumeStream: () => Promise<void>;
  finalizeStream: () => Promise<void>;
}) {
  const lastProgressAtRef = useRef(0);
  const lastResumeAttemptAtRef = useRef(0);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
    lastProgressAtRef.current = Date.now();
  }, [messages, status]);

  const attemptResume = useCallback(() => {
    if (statusRef.current !== "submitted") {
      return;
    }

    const now = Date.now();
    if (now - lastResumeAttemptAtRef.current < RESUME_COOLDOWN_MS) {
      return;
    }

    lastResumeAttemptAtRef.current = now;
    void resumeStream();
  }, [resumeStream]);

  const attemptFinalize = useCallback(() => {
    void finalizeStream();
  }, [finalizeStream]);

  useEffect(() => {
    const handleOnline = () => {
      if (statusRef.current === "submitted") {
        attemptResume();
        return;
      }

      if (statusRef.current === "streaming" || statusRef.current === "error") {
        attemptFinalize();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (statusRef.current === "submitted") {
          attemptResume();
          return;
        }

        if (statusRef.current === "streaming" || statusRef.current === "error") {
          attemptFinalize();
        }
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [attemptFinalize, attemptResume]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!isRecoverableStatus(statusRef.current)) {
        return;
      }

      const stalledForMs = Date.now() - lastProgressAtRef.current;
      if (stalledForMs > STALLED_RESUME_AFTER_MS) {
        if (statusRef.current === "streaming" || statusRef.current === "error") {
          attemptFinalize();
          return;
        }
        attemptResume();
      }
    }, STALL_CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [attemptFinalize, attemptResume]);
}
