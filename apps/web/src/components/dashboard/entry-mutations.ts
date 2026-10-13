import { apiFetch } from "@/lib/api";
import type { EntryCreateInput, EntryPatchInput } from "@/lib/validations";

interface EntryRecord {
  [key: string]: unknown;
  id: number | string;
}

interface EntryMutationResult {
  entry: EntryRecord;
  success: true;
}

const readErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return payload.error || "Request failed";
};

/**
 * Client-side replacement for the legacy `createEntryAction` server action.
 * Posts to the API and returns the created entry (id included) so callers can
 * attach media or navigate to the new record.
 */
export async function createEntryAction(
  data: EntryCreateInput
): Promise<EntryMutationResult> {
  const response = await apiFetch("/api/entries", {
    body: JSON.stringify(data),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { entry?: EntryRecord };
  if (!payload.entry) {
    throw new Error("Failed to create entry");
  }

  return { entry: payload.entry, success: true };
}

/**
 * Client-side replacement for the legacy `updateEntryAction` server action.
 * PATCHes the entry via the API and returns the updated entry.
 */
export async function updateEntryAction(
  id: number | string,
  data: EntryPatchInput
): Promise<EntryMutationResult> {
  const response = await apiFetch(`/api/entries/${id}`, {
    body: JSON.stringify(data),
    method: "PATCH",
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { entry?: EntryRecord };
  if (!payload.entry) {
    throw new Error("Failed to update entry");
  }

  return { entry: payload.entry, success: true };
}

/**
 * Client-side replacement for the legacy `deleteEntryAction` server action.
 *
 * NOTE(api): the legacy Next.js app exposed no DELETE /api/entries/:id route
 * (deletion went through a server action), so this depends on the new API
 * server implementing DELETE /api/entries/:id with the same semantics.
 */
export async function deleteEntryAction(id: number | string) {
  const response = await apiFetch(`/api/entries/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return { deletedId: Number(id), success: true };
}
