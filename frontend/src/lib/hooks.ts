import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './api';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (value: T) => void;
}

/** Runs a fetcher on mount and whenever `deps` change, with the usual
 *  loading/error bookkeeping and protection against setting state after
 *  unmount or after a newer request has superseded this one. */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    let active = true;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!active || id !== requestId.current) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (!active || id !== requestId.current) return;
        // A 401 is handled globally by the auth layer; do not also shout here.
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים');
      })
      .finally(() => {
        if (active && id === requestId.current) setLoading(false);
      });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload, setData };
}

/** Debounces a rapidly changing value, for search inputs. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Tracks an in-flight action (submit, approve, upload) for button states. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(
    task: () => Promise<T>,
    handlers?: { onSuccess?: (result: T) => void; onError?: (message: string) => void },
  ): Promise<T | undefined> => {
    setBusy(true);
    try {
      const result = await task();
      handlers?.onSuccess?.(result);
      return result;
    } catch (err) {
      handlers?.onError?.(err instanceof Error ? err.message : 'הפעולה נכשלה');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
