import { apiFetch } from "@/lib/api";
import type { ExpenseCreateInput } from "@/lib/validations";

interface ExpenseRecord {
  [key: string]: unknown;
  id: number | string;
}

interface ExpenseMutationResult {
  expense: ExpenseRecord;
  success: true;
}

const readErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  return payload.error || "Request failed";
};

/**
 * Client-side replacement for the legacy `createExpenseAction` server action.
 * Posts to the API and returns the created expense (id included) so callers
 * can attach receipt media.
 */
export async function createExpenseAction(
  data: ExpenseCreateInput
): Promise<ExpenseMutationResult> {
  const response = await apiFetch("/api/expenses", {
    body: JSON.stringify(data),
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { expense?: ExpenseRecord };
  if (!payload.expense) {
    throw new Error("Failed to create expense");
  }

  return { expense: payload.expense, success: true };
}

/**
 * Client-side replacement for the legacy `deleteExpenseAction` server action.
 *
 * NOTE(api): the legacy Next.js app exposed no DELETE /api/expenses/:id route
 * (deletion went through a server action), so this depends on the new API
 * server implementing DELETE /api/expenses/:id with the same semantics.
 */
export async function deleteExpenseAction(id: number | string) {
  const response = await apiFetch(`/api/expenses/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return { deletedId: Number(id), success: true };
}
