import { useEffect, useState } from "react";
import { normalizeApiError } from "@/api/apiError";

/** Context-keyed reads never present a previous class/member as the current result. */
export function useProgressResource<T>(context: string, load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const key = `${context}:${attempt}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setResult({ key, error: normalizeApiError(cause).message });
    });
    return () => controller.abort();
  }, [key, load]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, loading: !current,
    retry: () => setAttempt(value => value + 1) };
}
