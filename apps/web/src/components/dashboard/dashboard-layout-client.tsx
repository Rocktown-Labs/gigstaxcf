import { Link, useLocation } from "@tanstack/react-router";
import { BellRing } from "lucide-react";

import { GigStaxLogo } from "@/components/branding/gigstax-logo";
import { DashboardNavigation } from "@/components/dashboard/dashboard-navigation";
import { usePendingTipCount } from "@/components/dashboard/use-pending-tip-count";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const pendingTipCount = usePendingTipCount();
  const isNotificationsActive =
    pathname === "/dashboard/notifications" ||
    pathname.startsWith("/dashboard/notifications/");

  return (
    <SidebarProvider>
      <div className="bg-background flex min-h-screen w-full md:grid-cols-[240px_1fr]">
        <DashboardNavigation />

        <div className="relative z-0 flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <header className="border-border/50 bg-card/80 sticky top-0 z-40 flex h-16 items-center justify-between border-b px-4 backdrop-blur-md md:hidden">
            <Link to="/dashboard" className="text-xl">
              <GigStaxLogo />
            </Link>
            <div className="flex items-center gap-1.5">
              <Button
                asChild
                size="icon"
                variant="ghost"
                className={cn(
                  "relative h-9 w-9 rounded-full",
                  isNotificationsActive &&
                    "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                )}
              >
                <Link
                  to="/dashboard/notifications"
                  aria-label="Open notifications"
                >
                  <BellRing className="h-4 w-4" />
                  {pendingTipCount > 0 ? (
                    <span className="bg-primary text-primary-foreground absolute top-0.5 right-0.5 rounded-full px-1 py-0 text-[10px] leading-none font-semibold">
                      {pendingTipCount > 99 ? "99+" : pendingTipCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
