import {
  ArrowUpRight,
  BookOpenText,
  Brain,
  Cpu,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn how Nudge uses AI to generate progressive hints and editorials for competitive programming problems.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen pb-16">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.16),transparent_28%)]" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground shadow-sm">
              <Sparkles className="size-3.5" />
              About the project
            </span>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Learning competitive programming should feel like a conversation,
              not a spoiler.
            </h1>

            <p className="mt-4 max-w-2xl text-base/7 text-muted-foreground sm:text-lg/8">
              Nudge generates progressive hints for Codeforces problems so you
              can get unstuck at your own pace, without jumping straight to the
              full solution.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Three stages, fully automated.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StepCard
              icon={Cpu}
              step="1"
              title="Scrape & queue"
              description="We pull completed problems from the Codeforces API and queue them for generation using Trigger.dev background jobs."
            />
            <StepCard
              icon={Brain}
              step="2"
              title="AI generation"
              description="A state-of-the-art LLM generates five progressive hints, a clean editorial, and a full C++ solution via the Batch API."
            />
            <StepCard
              icon={BookOpenText}
              step="3"
              title="Browse & learn"
              description="Problems show up here with collapsible hints, so you only reveal as much as you need to keep making progress."
            />
          </div>
        </section>

        <section className="mt-10">
          <div className="rounded-[1.75rem] border border-border/70 bg-card/75 p-6 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur sm:p-8">
            <div className="flex items-start gap-4">
              <div className="shrink-0 rounded-full border border-border/60 bg-background/80 p-2.5 text-muted-foreground">
                <Lightbulb className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold tracking-tight">
                  Why progressive hints?
                </h3>
                <p className="mt-2 text-sm/6 text-muted-foreground">
                  Reading a full editorial the moment you&apos;re stuck kills
                  the learning. A small nudge in the right direction is usually
                  enough to get you going again. Nudge gives you five levels of
                  help, from the gentlest push to the full key insight, so
                  you&apos;re always in control of how much you see.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-10 text-center">
          <a
            href="https://github.com/ShrootBuck/nudge"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/75 px-5 py-2.5 text-sm font-medium transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg"
          >
            View on GitHub
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </a>
        </section>
      </div>
    </main>
  );
}

function StepCard({
  icon: Icon,
  step,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/60 bg-card/75 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg">
      <div className="flex items-center gap-3">
        <div className="inline-flex size-8 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Step {step}
        </span>
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm/6 text-muted-foreground">{description}</p>
    </div>
  );
}
