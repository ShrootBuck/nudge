"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Problems" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is required to trigger on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="border-b border-border/50 bg-background/60 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight transition hover:opacity-80"
          >
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-foreground text-background text-xs font-bold">
              N
            </span>
            Nudge
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                    isActive
                      ? "bg-foreground/[0.07] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/ShrootBuck/nudge"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition hover:border-foreground/15 hover:text-foreground"
            >
              <span className="sr-only">GitHub repository</span>
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
              </svg>
            </a>

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition hover:border-foreground/15 hover:text-foreground sm:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="size-3.5" />
              ) : (
                <Menu className="size-3.5" />
              )}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl sm:hidden">
          <div className="mx-auto max-w-6xl space-y-1 px-4 pb-4 pt-2">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "block rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
                    isActive
                      ? "bg-foreground/[0.07] text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
