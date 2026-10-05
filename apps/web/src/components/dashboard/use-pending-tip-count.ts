import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";

interface PendingTipEntry {
  tipStatus?: string;
  tip_status?: string;
}

interface EntriesPayload {
  deliveries?: PendingTipEntry[];
  entries?: PendingTipEntry[];
  pagination?: {
    totalItems?: number;
  };
}

const getPendingCount = (entries: PendingTipEntry[]) => {
  let count = 0;
  for (const entry of entries) {
    const tipStatus = String(entry.tipStatus || entry.tip_status || "none")
      .trim()
      .toLowerCase();
    if (tipStatus === "pending") {
      count += 1;
    }
  }

  return count;
};

export const usePendingTipCount = () => {
  const { data = 0 } = useQuery({
    queryFn: async () => {
      const response = await apiFetch(
        "/api/entries?status=completed&tipStatus=pending&page=1&pageSize=1"
      );
      if (!response.ok) {
        return 0;
      }

      const payload = (await response.json()) as EntriesPayload;
      if (typeof payload.pagination?.totalItems === "number") {
        return payload.pagination.totalItems;
      }

      const entries = payload.entries || payload.deliveries || [];

      return getPendingCount(entries);
    },
    queryKey: ["entries", "pending-tip-count"],
    staleTime: 30_000,
  });

  return data;
};
