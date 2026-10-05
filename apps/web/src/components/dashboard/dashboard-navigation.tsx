import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BellRing,
  ChevronRight,
  CreditCard,
  FileText,
  Home,
  LogOut,
  MapPin,
  MoreHorizontal,
  Receipt,
  Settings,
  Shield,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { GigStaxLogo } from "@/components/branding/gigstax-logo";
import { usePendingTipCount } from "@/components/dashboard/use-pending-tip-count";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { apiFetch } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type DashboardNavRoute =
  | "/dashboard"
  | "/dashboard/deliveries"
  | "/dashboard/expenses"
  | "/dashboard/goals"
  | "/dashboard/stubs"
  | "/dashboard/notifications"
  | "/dashboard/billing"
  | "/dashboard/settings"
  | "/dashboard/admin";

type NavItemId =
  | "overview"
  | "trips"
  | "notifications"
  | "expenses"
  | "goals"
  | "billing"
  | "stubs"
  | "settings"
  | "admin";
interface NavItem {
  adminOnly?: boolean;
  icon: LucideIcon;
  id: NavItemId;
  title: string;
  url: DashboardNavRoute;
}

const navItems: NavItem[] = [
  { icon: Home, id: "overview", title: "Overview", url: "/dashboard" },
  { icon: MapPin, id: "trips", title: "Trips", url: "/dashboard/deliveries" },
  {
    icon: Receipt,
    id: "expenses",
    title: "Expenses",
    url: "/dashboard/expenses",
  },
  { icon: Target, id: "goals", title: "Goals", url: "/dashboard/goals" },
  { icon: FileText, id: "stubs", title: "Stubs", url: "/dashboard/stubs" },
  {
    icon: BellRing,
    id: "notifications",
    title: "Notifications",
    url: "/dashboard/notifications",
  },
  {
    icon: CreditCard,
    id: "billing",
    title: "Billing",
    url: "/dashboard/billing",
  },
  {
    icon: Settings,
    id: "settings",
    title: "Settings",
    url: "/dashboard/settings",
  },
  {
    adminOnly: true,
    icon: Shield,
    id: "admin",
    title: "Admin",
    url: "/dashboard/admin",
  },
];

const mobilePrimaryItemIds = new Set<NavItemId>([
  "overview",
  "trips",
  "expenses",
  "goals",
]);

const isNavItemActive = (pathname: string, url: string) => {
  if (url === "/dashboard") {
    return pathname === url;
  }

  return pathname === url || pathname.startsWith(`${url}/`);
};

export function DashboardNavigation() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const pendingTipCount = usePendingTipCount();
  const { data: userRole = "driver" } = useQuery({
    queryFn: async () => {
      const response = await apiFetch("/api/user");
      if (!response.ok) {
        return "driver";
      }

      const payload = (await response.json()) as {
        user?: { role?: string };
      };
      return payload.user?.role === "admin" ? "admin" : "driver";
    },
    queryKey: ["user-role"],
    staleTime: 30_000,
  });
  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || userRole === "admin"
  );
  const mobilePrimaryItems = visibleNavItems.filter((item) =>
    mobilePrimaryItemIds.has(item.id)
  );
  const mobileOverflowItems = visibleNavItems.filter(
    (item) => !mobilePrimaryItemIds.has(item.id)
  );
  const isMoreActive = mobileOverflowItems.some((item) =>
    isNavItemActive(pathname, item.url)
  );

  const handleSignOut = () => {
    setIsSigningOut(true);
    authClient
      .signOut({
        fetchOptions: {
          onError: () => {
            setIsSigningOut(false);
          },
          onSuccess: () => {
            setIsSigningOut(false);
            navigate({ to: "/login" });
          },
        },
      })
      .catch((error: unknown) => {
        console.error("[GigStax] Sign out error:", error);
        setIsSigningOut(false);
        navigate({ to: "/login" });
      });
  };

  return (
    <>
      <Sidebar className="border-border/50 bg-card/50 hidden border-r backdrop-blur-md md:flex">
        <SidebarHeader className="border-border/50 flex h-16 items-center border-b px-4">
          <Link to="/dashboard" className="text-xl">
            <GigStaxLogo />
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="text-muted-foreground/70 mt-4 text-xs font-semibold tracking-wider uppercase">
              Menu
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleNavItems.map((item) => {
                  const isActive = isNavItemActive(pathname, item.url);
                  const isNotifications = item.id === "notifications";

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        className={cn(
                          "rounded-xl border border-transparent px-3 py-2.5",
                          isActive
                            ? "border-primary/30 bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        )}
                        isActive={isActive}
                      >
                        <Link to={item.url} className="flex items-center gap-3">
                          <item.icon className="h-4 w-4" />
                          <span className="font-medium">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {isNotifications && pendingTipCount > 0 ? (
                        <SidebarMenuBadge
                          className={cn(
                            "bg-primary/20 right-3 rounded-full px-1.5 text-[10px] font-semibold",
                            isActive ? "text-primary" : "text-foreground"
                          )}
                        >
                          {pendingTipCount > 99 ? "99+" : pendingTipCount}
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-border/50 space-y-4 border-t p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm font-medium">
              Theme
            </span>
            <ThemeToggle />
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={isSigningOut}
            className="text-muted-foreground hover:text-foreground w-full justify-start"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {isSigningOut ? "Signing Out..." : "Sign Out"}
          </Button>
        </SidebarFooter>
      </Sidebar>

      <nav className="border-border/50 bg-card/90 pb-safe fixed right-0 bottom-0 left-0 z-50 grid h-16 grid-cols-5 items-center border-t px-1 backdrop-blur-xl md:hidden">
        {mobilePrimaryItems.map((item) => {
          const isActive = isNavItemActive(pathname, item.url);

          return (
            <Link
              key={item.id}
              to={item.url}
              className={cn(
                "relative flex h-full w-full flex-col items-center justify-center space-y-1 rounded-xl transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold tracking-wide">
                {item.title}
              </span>
            </Link>
          );
        })}

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative flex h-full w-full flex-col items-center justify-center space-y-1 rounded-xl transition-colors",
                isMoreActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="Open more dashboard routes"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] font-semibold tracking-wide">
                More
              </span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="border-border/60 bg-card/95 pb-safe gap-0 rounded-t-2xl px-0"
          >
            <SheetHeader className="border-border/60 border-b pb-3">
              <SheetTitle>More</SheetTitle>
              <SheetDescription>
                Additional routes and account actions.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-1 px-3 py-3">
              {mobileOverflowItems.map((item) => {
                const isActive = isNavItemActive(pathname, item.url);
                const isNotifications = item.id === "notifications";

                return (
                  <SheetClose key={item.id} asChild>
                    <Link
                      to={item.url}
                      className={cn(
                        "flex items-center justify-between rounded-xl border border-transparent px-3 py-3 transition-colors",
                        isActive
                          ? "border-primary/30 bg-primary/15 text-primary"
                          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {item.title}
                        </span>
                      </span>
                      {isNotifications && pendingTipCount > 0 ? (
                        <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold">
                          {pendingTipCount > 99 ? "99+" : pendingTipCount}
                        </span>
                      ) : (
                        <ChevronRight className="h-4 w-4 opacity-60" />
                      )}
                    </Link>
                  </SheetClose>
                );
              })}
            </div>
            <SheetFooter className="border-border/60 border-t p-3">
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isSigningOut}
                  className="text-muted-foreground hover:text-foreground w-full justify-start"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {isSigningOut ? "Signing Out..." : "Sign Out"}
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}
