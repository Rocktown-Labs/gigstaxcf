import type { ExpenseCategory } from "./types";

export const EXPENSE_CATEGORY_OPTIONS: {
  label: string;
  value: ExpenseCategory;
}[] = [
  { label: "Fuel", value: "fuel" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Tolls", value: "tolls" },
  { label: "Parking", value: "parking" },
  { label: "Supplies", value: "supplies" },
  { label: "Phone", value: "phone" },
  { label: "Other", value: "other" },
];
