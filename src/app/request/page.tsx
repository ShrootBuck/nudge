"use client";

import { ArrowUpRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_PROBLEM_INPUT_LENGTH } from "@/lib/codeforces-problem";
import { requestProblem } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Submitting..." : "Queue Problem"}
    </Button>
  );
}

export default function RequestPage() {
  const [state, formAction] = useActionState(requestProblem, null);
  const [input, setInput] = useState("");
  const currentState = state?.input === input.trim() ? state : null;

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen pb-16">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
        <section className="relative overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/80 p-5 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[2rem] sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.16),transparent_28%)]" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground shadow-sm">
              <ClipboardList className="size-3.5" />
              Request a problem
            </span>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Want a specific problem solved?
            </h1>

            <p className="mt-4 max-w-2xl text-base/7 text-muted-foreground sm:text-lg/8">
              Enter a Codeforces problem ID or URL. Requests queue up for the
              next generation run, but there is no guaranteed completion time.
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="rounded-[1.25rem] border border-border/70 bg-card/75 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[1.75rem] sm:p-8">
            <form action={formAction}>
              <FieldGroup>
                <Field data-invalid={!!currentState?.error}>
                  <FieldLabel htmlFor="problem">Problem ID or URL</FieldLabel>
                  <Input
                    id="problem"
                    name="problem"
                    placeholder="e.g. 123A or a Codeforces problem URL"
                    maxLength={MAX_PROBLEM_INPUT_LENGTH}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    aria-invalid={!!currentState?.error}
                    aria-describedby={
                      currentState?.error
                        ? "problem-help problem-error"
                        : "problem-help"
                    }
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    required
                  />
                  <FieldDescription id="problem-help">
                    Spaces and slashes work too: 123 A, 123/A, or 921/01.
                  </FieldDescription>
                  {currentState?.error && (
                    <FieldError id="problem-error">
                      {currentState.error}
                    </FieldError>
                  )}
                </Field>
                {currentState?.message && (
                  <output aria-live="polite">
                    <Alert role="none">
                      <AlertDescription>
                        <p>{currentState.message}</p>
                        {currentState.problemHref ? (
                          <Link
                            href={currentState.problemHref}
                            className="inline-flex items-center gap-2"
                          >
                            Open the problem page
                            <ArrowUpRight className="size-3.5" />
                          </Link>
                        ) : null}
                      </AlertDescription>
                    </Alert>
                  </output>
                )}

                <SubmitButton />
              </FieldGroup>
            </form>
          </div>
        </section>

        <section className="mt-8">
          <div className="rounded-[1.25rem] border border-border/70 bg-card/75 p-5 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.45)] backdrop-blur sm:rounded-[1.75rem] sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight">
              Looking for something else?
            </h2>
            <p className="mt-2 text-sm/6 text-muted-foreground">
              If you have other questions, found a bug, or want to contribute to
              the project, check out our contact page.
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-lg"
            >
              Contact Us
              <ArrowUpRight className="size-3.5 text-muted-foreground" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
