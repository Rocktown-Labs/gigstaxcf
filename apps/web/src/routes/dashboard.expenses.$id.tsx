import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  Fuel,
  Info,
  Receipt,
  Trash2,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import {
  dashboardPageMainNarrowClass,
  dashboardPageOuterClass,
} from "@/components/dashboard/dashboard-page-classes";
import { deleteExpenseAction } from "@/components/dashboard/expense-mutations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Expense {
  id: string;
  amount: number;
  category: string;
  notes: string | null;
  incurred_at: string;
}

export const Route = createFileRoute("/dashboard/expenses/$id")({
  component: ExpenseDetailPage,
  head: () => ({
    meta: [{ title: "Expense Details" }],
  }),
});

function ExpenseDetailPage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState("");
  const { data: expense, isLoading: loading } = useQuery({
    enabled: !!params.id,
    queryFn: async () => {
      const response = await apiFetch(`/api/expenses/${params.id}`);
      if (!response.ok) {
        throw new Error("Failed to fetch expense");
      }
      const data = await response.json();
      return data.expense as Expense | undefined;
    },
    queryKey: ["expenses", params.id],
  });

  const { mutate: deleteExpense, isPending: isDeleting } = useMutation({
    mutationFn: deleteExpenseAction,
    onError: (err) => {
      console.error("Failed to delete", err);
      setDeleteError("Failed to delete expense. Please try again.");
    },
    onSuccess: () => {
      navigate({ to: "/dashboard/expenses" });
    },
  });

  const handleDelete = () => {
    setDeleteError("");
    deleteExpense(params.id as string);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "fuel": {
        return <Fuel className="h-8 w-8" />;
      }
      case "maintenance": {
        return <Wrench className="h-8 w-8" />;
      }
      default: {
        return <Receipt className="h-8 w-8" />;
      }
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "fuel": {
        return "text-orange-500 bg-orange-500/10";
      }
      case "maintenance": {
        return "text-blue-500 bg-blue-500/10";
      }
      case "tolls": {
        return "text-purple-500 bg-purple-500/10";
      }
      default: {
        return "text-gray-500 bg-gray-500/10";
      }
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          dashboardPageMainNarrowClass,
          "flex max-w-2xl justify-center py-12"
        )}
      >
        <div className="border-primary/30 border-t-primary h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    );
  }

  if (!expense) {
    return (
      <div
        className={cn(
          dashboardPageMainNarrowClass,
          "max-w-2xl py-12 text-center"
        )}
      >
        <h2 className="mb-4 text-2xl font-bold">Expense Not Found</h2>
        <Button asChild>
          <Link to="/dashboard/expenses">Back to Expenses</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={dashboardPageOuterClass}>
      <main className={cn(dashboardPageMainNarrowClass, "max-w-2xl space-y-6")}>
        <Button
          variant="ghost"
          asChild
          className="mb-2 -ml-4 hover:bg-transparent"
        >
          <Link
            to="/dashboard/expenses"
            className="text-muted-foreground hover:text-foreground flex items-center"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Expenses
          </Link>
        </Button>

        <Card className="border-border/50 bg-card/80 overflow-hidden rounded-2xl shadow-lg backdrop-blur-md">
          <div className="border-border/50 from-background/50 flex flex-col items-center justify-center border-b bg-gradient-to-b to-transparent p-8">
            <div
              className={`mb-4 rounded-full p-5 ${getCategoryColor(expense.category)}`}
            >
              {getCategoryIcon(expense.category)}
            </div>
            <h1 className="text-destructive mb-2 text-4xl font-extrabold tracking-tight">
              -${Number(expense.amount).toFixed(2)}
            </h1>
            <div className="text-foreground mb-2 text-lg font-medium capitalize">
              {expense.category} Expense
            </div>
          </div>

          <CardContent className="space-y-6 p-6">
            <div className="space-y-4">
              <div className="bg-background/50 border-border/50 flex items-start gap-3 rounded-xl border p-4">
                <CalendarDays className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <div className="text-muted-foreground mb-1 text-sm font-semibold tracking-wider uppercase">
                    Date Logged
                  </div>
                  <div className="font-medium">
                    {new Date(expense.incurred_at).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "long",
                      weekday: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>

              {expense.notes && (
                <div className="bg-secondary/20 border-secondary/30 flex items-start gap-3 rounded-xl border p-4">
                  <Info className="text-primary/70 mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <div className="text-muted-foreground mb-1 text-sm font-semibold tracking-wider uppercase">
                      Notes
                    </div>
                    <div className="text-foreground/90 leading-relaxed italic">
                      "{expense.notes}"
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-border/50 flex flex-col gap-4 border-t pt-6 sm:flex-row">
              {deleteError && (
                <div className="border-destructive/20 bg-destructive/10 text-destructive w-full rounded-xl border p-3 text-sm">
                  {deleteError}
                </div>
              )}
              <Button
                variant="outline"
                className="border-border/50 h-12 flex-1 rounded-xl"
                onClick={() => navigate({ to: "/dashboard/expenses" })}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/20 h-12 flex-1 rounded-xl border"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
