import Link from "next/link";
import { GitHubIcon } from "@/components/github-icon";
import { NAV_LINKS } from "@/lib/nav-links";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex size-5 items-center justify-center rounded bg-foreground text-background text-[10px] font-bold">
              N
            </span>
            <span>
              Nudge &mdash; built by{" "}
              <a
                href="https://zaydkrunz.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline decoration-border underline-offset-4 transition hover:decoration-foreground/40"
              >
                Zayd Krunz
              </a>
            </span>
          </div>

          <div className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/ShrootBuck/nudge"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition hover:text-foreground"
            >
              <span className="sr-only">GitHub</span>
              <GitHubIcon className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
