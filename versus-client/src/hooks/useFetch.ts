/**
 * Custom hook for fetching data with loading and error states
 * Reduces boilerplate in components
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface UseFetchOptions {
  showToast?: boolean;
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  reset: () => void;
}

export function useFetch<T>(
  fetchFn: () => Promise<T>,
  deps: any[] = [],
  options: UseFetchOptions = {},
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetchFn();
      setData(result);

      if (options.successMessage && options.showToast) {
        toast.success(options.successMessage);
      }

      if (options.onSuccess) {
        options.onSuccess(result);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("An error occurred");
      setError(error);

      const message =
        options.errorMessage || error.message || "Failed to fetch data";
      if (options.showToast) {
        toast.error(message);
      }

      if (options.onError) {
        options.onError(error);
      }
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    data,
    loading,
    error,
    refetch: execute,
    reset: () => {
      setData(null);
      setError(null);
      setLoading(true);
    },
  };
}

/**
 * Hook for multiple concurrent fetches
 */
export function useMultiFetch<T extends Record<string, any>>(
  fetchMap: { [K in keyof T]: () => Promise<T[K]> },
  deps: any[] = [],
  options: UseFetchOptions = {},
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const entries = Object.entries(fetchMap) as Array<
        [keyof T, () => Promise<any>]
      >;
      const promises = entries.map(async ([key, fn]) => {
        const result = await fn();
        return [key, result];
      });

      const results = await Promise.all(promises);
      const combinedData = Object.fromEntries(results) as T;

      setData(combinedData);

      if (options.successMessage && options.showToast) {
        toast.success(options.successMessage);
      }

      if (options.onSuccess) {
        options.onSuccess(combinedData);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("An error occurred");
      setError(error);

      const message =
        options.errorMessage || error.message || "Failed to fetch data";
      if (options.showToast) {
        toast.error(message);
      }

      if (options.onError) {
        options.onError(error);
      }
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    data,
    loading,
    error,
    refetch: execute,
    reset: () => {
      setData(null);
      setError(null);
      setLoading(true);
    },
  };
}

/**
 * Hook for mutations (POST, PUT, DELETE)
 */
export function useMutation<T, P = any>(
  mutationFn: (params: P) => Promise<T>,
  options: UseFetchOptions & { invalidateQueries?: (() => void)[] } = {},
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = useCallback(
    async (params: P) => {
      try {
        setLoading(true);
        setError(null);
        const result = await mutationFn(params);

        if (options.successMessage && options.showToast) {
          toast.success(options.successMessage);
        }

        if (options.onSuccess) {
          options.onSuccess(result);
        }

        // Invalidate related queries
        if (options.invalidateQueries) {
          options.invalidateQueries.forEach((fn) => fn());
        }

        return result;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("An error occurred");
        setError(error);

        const message =
          options.errorMessage || error.message || "Operation failed";
        if (options.showToast) {
          toast.error(message);
        }

        if (options.onError) {
          options.onError(error);
        }

        throw error;
      } finally {
        setLoading(false);
      }
    },
    [mutationFn],
  );

  return {
    mutate,
    loading,
    error,
    reset: () => setError(null),
  };
}
