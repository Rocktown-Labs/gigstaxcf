import { BulkExpenseManager } from "@/components/dashboard/bulk-expense/bulk-expense-manager";

interface ExpenseBulkManagerProps {
  onSaved?: () => Promise<void> | void;
}

export function ExpenseBulkManager({ onSaved }: ExpenseBulkManagerProps) {
  return <BulkExpenseManager onSaved={onSaved} />;
}
