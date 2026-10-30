"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { CommandMenu } from "@/components/command-menu";
import { GitHubIcon } from "@/components/github-icon";
import { NAV_LINKS } from "@/lib/nav-links";
import { cn } from "@/lib/utils";

type NavigationLinksProps = {
  mobile?: boolean;
  onNavigate?: () => void;
  pathname?: string;
};

function NavigationLinks({
  mobile = false,
  onNavigate,
  pathname,
}: NavigationLinksProps) {
  return NAV_LINKS.map((link) => {
    const isActive =
      pathname === link.href || pathname?.startsWith(`${link.href}/`);

    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "text-sm font-medium transition-colors",
          mobile
            ? "block rounded-xl px-3.5 py-2.5"
            : "rounded-full px-3.5 py-2",
          isActive
            ? "bg-foreground/[0.07] text-foreground"
            : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
        )}
      >
        {link.label}
      </Link>
    );
  });
}

function ActiveNavigationLinks(props: NavigationLinksProps) {
  const pathname = usePathname();
  return <NavigationLinks {...props} pathname={pathname} />;
}

export function Navbar({ currentModel }: { currentModel?: ReactNode }) {
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;

    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      menuButtonRef.current?.focus();
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node))
        setMobileOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    };
  }, [mobileOpen]);

  const closeMenu = () => setMobileOpen(false);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 w-full shrink-0">
      <div className="border-b border-border/50 bg-background/95 backdrop-blur-xl">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8"
        >
          <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 lg:flex-row lg:items-center lg:gap-3">
            <Link
              href="/"
              onClick={closeMenu}
              aria-label="Nudge home"
              className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight transition-opacity hover:opacity-80"
            >
              <BrandMark className="size-7 shrink-0" />
              Nudge
            </Link>
            <div className="flex h-5 min-w-0 max-w-full items-center lg:w-64">
              {currentModel}
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-1 md:flex">
            <Suspense fallback={<NavigationLinks />}>
              <ActiveNavigationLinks />
            </Suspense>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                closeMenu();
                setCommandOpen(true);
              }}
              className="flex h-9 items-center justify-center gap-2 rounded-full border border-border/60 bg-background/60 px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground lg:px-3"
              aria-label="Search problems"
              aria-haspopup="dialog"
            >
              <Search className="size-4 shrink-0" />
              <span className="hidden lg:inline-block">Search...</span>
              <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium xl:flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>

            <a
              href="https://github.com/ShrootBuck/nudge"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground"
            >
              <span className="sr-only">GitHub repository</span>
              <GitHubIcon className="size-4" />
            </a>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              aria-controls="site-mobile-nav"
              className="inline-flex size-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground md:hidden"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <X className="size-4" />
              ) : (
                <Menu className="size-4" />
              )}
            </button>
          </div>
        </nav>
      </div>

      {mobileOpen && (
        <nav
          id="site-mobile-nav"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border/50 bg-background shadow-lg md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 pt-2 pb-4">
            <Suspense
              fallback={<NavigationLinks mobile onNavigate={closeMenu} />}
            >
              <ActiveNavigationLinks mobile onNavigate={closeMenu} />
            </Suspense>
          </div>
        </nav>
      )}
      <CommandMenu open={commandOpen} setOpen={setCommandOpen} />
    </header>
  );
}
