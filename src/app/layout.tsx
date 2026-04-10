import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Nudge",
    template: "%s | Nudge",
  },
  description:
    "Progressive hints, clean editorials, and full C++ solutions for Codeforces problems.",
  applicationName: "Nudge",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Nudge",
    description:
      "Progressive hints, clean editorials, and full C++ solutions for Codeforces problems.",
    url: SITE_URL,
    siteName: "Nudge",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Nudge",
    description:
      "Progressive hints, clean editorials, and full C++ solutions for Codeforces problems.",
  },
  icons: {
    icon: "https://fav.farm/💻",
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
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="bg-orange-500/10 px-4 py-2 text-center text-sm font-medium text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-b border-orange-500/20">
            ⚠️ Heads up: This is experimental alpha software. Expect bugs and
            breaking changes.
          </div>
          <Navbar />
          {children}
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
