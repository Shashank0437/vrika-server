"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isPending, listScans, type MobileScan } from "@/lib/mobileSecurity";

const POLL_MS = 5000;

export function useMobileScans({ page = 1, pageSize = 20, q = "" }: { page?: number; pageSize?: number; q?: string }) {
  const [items, setItems] = useState<MobileScan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await listScans({ page, pageSize, q });
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load scans");
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, q],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (items.some(isPending)) timer.current = setTimeout(() => void load(true), POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [items, load]);

  return { items, total, loading, error, reload: load, setItems };
}
