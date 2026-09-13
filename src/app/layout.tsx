import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { SITE_URL } from "@/lib/env";
import { NAV_LINKS } from "@/lib/nav-links";
import {
  createPageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "@/lib/site-metadata";
import "./globals.css";

const themeInitScript = `
(() => {
  const storageKey = "theme";
  const root = document.documentElement;

  function applyTheme(value) {
    const resolved =
      value === "light" || value === "dark"
        ? value
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }

  try {
    applyTheme(window.localStorage.getItem(storageKey));
  } catch {
    applyTheme(null);
  }
})();
`;

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...createPageMetadata({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    path: "/",
    absoluteTitle: true,
  }),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  keywords: [
    "Codeforces",
    "competitive programming",
    "programming hints",
    "editorials",
    "C++ solutions",
  ],
  category: "education",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

function NavbarFallback() {
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="border-b border-border/50 bg-background/60 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight transition hover:opacity-80"
          >
            <BrandMark className="size-7 shrink-0" />
            Nudge
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="size-8 rounded-full border border-border/60 bg-background/60" />
            <div className="size-8 rounded-full border border-border/60 bg-background/60 md:hidden" />
          </div>
        </nav>
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <Suspense fallback={<NavbarFallback />}>
          <Navbar />
        </Suspense>
        {children}
        <Footer />
      </body>
    </html>
  );
}
