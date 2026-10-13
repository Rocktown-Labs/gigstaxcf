import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { GigStaxLogo } from "@/components/branding/gigstax-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const CURRENT_YEAR = new Date().getFullYear();

const navLinks = [
  { hash: "features", label: "Features" },
  { hash: "pricing", label: "Pricing" },
  { hash: "faq", label: "FAQ" },
];

/**
 * Ported from the legacy Next.js `(marketing)/layout.tsx`.
 * The session-aware "Open App" button is client-side via better-auth.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const isOnboarded = Boolean(
    (session?.user as { isOnboarded?: boolean } | undefined)?.isOnboarded
  );
  const appHref = session ? (isOnboarded ? "/dashboard" : "/onboarding") : null;

  return (
    <div className="bg-background selection:bg-primary/20 selection:text-primary flex min-h-screen flex-col">
      <header className="border-border/50 bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur-md">
        <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="group text-xl">
            <GigStaxLogo className="transition-opacity group-hover:opacity-90" />
          </Link>

          <nav className="flex items-center gap-6">
            <div className="hidden items-center gap-6 text-sm font-medium md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.hash}
                  href={`/#${link.hash}`}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="border-border/50 ml-2 flex items-center gap-4 border-l pl-6">
              <ThemeToggle />
              {session ? (
                <Button asChild className="rounded-full font-semibold">
                  <Link to={appHref ?? "/onboarding"}>Open App</Link>
                </Button>
              ) : (
                <>
                  <Button
                    asChild
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                  >
                    <Link to="/login">Log in</Link>
                  </Button>
                  <Button asChild className="rounded-full font-semibold">
                    <Link to="/signup">Get Started</Link>
                  </Button>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main className="w-full flex-1">{children}</main>

      <footer className="border-border/50 bg-card/30 mt-auto border-t">
        <div className="container mx-auto max-w-7xl px-4 py-8 md:py-12">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <Link to="/" className="mb-4 inline-flex">
                <GigStaxLogo />
              </Link>
              <p className="text-muted-foreground max-w-xs text-sm">
                The easiest way for gig workers to track earnings, set goals,
                and know exactly what they make.
              </p>
            </div>
            <div>
              <h3 className="text-foreground mb-4 font-semibold">Product</h3>
              <ul className="text-muted-foreground space-y-3 text-sm">
                {navLinks.map((link) => (
                  <li key={link.hash}>
                    <a
                      href={`/#${link.hash}`}
                      className="hover:text-primary transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-foreground mb-4 font-semibold">Legal</h3>
              <ul className="text-muted-foreground space-y-3 text-sm">
                <li>
                  <Link
                    to="/privacy"
                    className="hover:text-primary transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    to="/terms"
                    className="hover:text-primary transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-border/50 text-muted-foreground mt-8 flex flex-col items-center justify-between gap-2 border-t pt-8 text-xs md:flex-row">
            <div>
              <p>© {CURRENT_YEAR} GigStax. All rights reserved.</p>
              <p className="mt-1">
                A product of{" "}
                <a
                  href="https://www.rocktownlabs.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-2"
                >
                  Rocktown Labs
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
