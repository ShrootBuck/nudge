import { ArrowUpRight, Bug, Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Nudge team.",
};

export default function ContactPage() {
  return (
    <main className="min-h-screen pb-16">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.16),transparent_28%)]" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground shadow-sm">
              <MessageCircle className="size-3.5" />
              Get in touch
            </span>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Have a question, idea, or found a bug?
            </h1>

            <p className="mt-4 max-w-2xl text-base/7 text-muted-foreground sm:text-lg/8">
              Nudge is open source and community feedback is always welcome.
              Here&apos;s how to reach us.
            </p>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <ContactCard
            icon={Bug}
            title="Open an issue"
            description="Found a bug or have a feature request? Open an issue on the GitHub repo and we'll take a look."
            href="https://github.com/ShrootBuck/nudge/issues"
            linkLabel="Go to Issues"
          />
          <ContactCard
            icon={Mail}
            title="Send an email"
            description="For anything else, drop an email and I'll get back to you as soon as we can."
            href="mailto:contact@zaydkrunz.com"
            linkLabel="contact@zaydkrunz.com"
          />
        </section>

        <section className="mt-8">
          <div className="rounded-[1.75rem] border border-border/70 bg-card/75 p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">
              Want to contribute?
            </h2>
            <p className="mt-2 text-sm/6 text-muted-foreground">
              Nudge is fully open source. Whether it&apos;s fixing a typo,
              improving the hint quality, or adding a new feature, pull requests
              are welcome. Check out the repo to get started.
            </p>
            <a
              href="https://github.com/ShrootBuck/nudge"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg"
            >
              View repository
              <ArrowUpRight className="size-3.5 text-muted-foreground" />
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

function ContactCard({
  icon: Icon,
  title,
  description,
  href,
  linkLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/60 bg-card/75 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg sm:p-6">
      <div className="inline-flex size-10 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm/6 text-muted-foreground">{description}</p>
      <a
        href={href}
        target={href.startsWith("mailto:") ? undefined : "_blank"}
        rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition hover:opacity-70"
      >
        {linkLabel}
        <ArrowUpRight className="size-3.5 text-muted-foreground" />
      </a>
    </div>
  );
}
