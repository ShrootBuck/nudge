import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { CurrentModel } from "@/components/current-model";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { SITE_URL } from "@/lib/env";
import {
  createPageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "@/lib/site-metadata";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  colorScheme: "light dark",
};

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
      <head>
        {/* Apply the saved theme before first paint, without a JS bundle. */}
        <script
          id="theme-init"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Static first-party theme bootstrap; no interpolated user content.
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="fixed top-3 left-3 z-[100] -translate-y-20 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        <Navbar
          currentModel={
            <Suspense fallback={null}>
              <CurrentModel />
            </Suspense>
          }
        />
        {children}
        <Footer />
      </body>
    </html>
  );
}
