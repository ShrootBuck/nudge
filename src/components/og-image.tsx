import type { ReactNode } from "react";

export const OG_COLORS = {
  background: "#0a0f18",
  panel: "#111927",
  foreground: "#f8fafc",
  muted: "#94a3b8",
  border: "rgba(148, 163, 184, 0.2)",
  sky: "#38bdf8",
  amber: "#fbbf24",
} as const;

export function OgFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        color: OG_COLORS.foreground,
        backgroundColor: OG_COLORS.background,
        backgroundImage:
          "linear-gradient(135deg, #080d15 0%, #0e1725 54%, #19160e 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: 999,
          border: "1px solid rgba(56, 189, 248, 0.14)",
          top: -310,
          left: -80,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 620,
          height: 620,
          borderRadius: 999,
          border: "1px solid rgba(251, 191, 36, 0.13)",
          right: -330,
          bottom: -400,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 7,
          height: 220,
          borderRadius: 999,
          background: "linear-gradient(180deg, #38bdf8, #fbbf24)",
          left: 0,
          top: 205,
        }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "48px 56px 44px",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function OgBrand() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          width: 44,
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 11,
          backgroundColor: OG_COLORS.foreground,
          color: OG_COLORS.background,
          fontSize: 23,
          fontWeight: 800,
        }}
      >
        N
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: 14,
        }}
      >
        <div style={{ display: "flex", fontSize: 22, fontWeight: 700 }}>
          Nudge
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 2,
            color: OG_COLORS.muted,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.24em",
          }}
        >
          COMPETITIVE PROGRAMMING
        </div>
      </div>
    </div>
  );
}

const HINT_LEVELS = ["gentle", "warmer", "direction", "almost", "insight"];

export function HintLadder({ activeLevels = 5 }: { activeLevels?: number }) {
  return (
    <div
      style={{
        width: 298,
        display: "flex",
        flexDirection: "column",
        padding: "25px 24px 22px",
        borderRadius: 24,
        border: `1px solid ${OG_COLORS.border}`,
        backgroundColor: "rgba(17, 25, 39, 0.82)",
      }}
    >
      <div
        style={{
          display: "flex",
          color: OG_COLORS.muted,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
        }}
      >
        REVEAL AT YOUR PACE
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 8,
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        A nudge, not a spoiler.
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 22,
        }}
      >
        {HINT_LEVELS.map((label, index) => {
          const active = index < activeLevels;
          return (
            <div
              key={label}
              style={{
                height: 47,
                display: "flex",
                alignItems: "center",
                marginTop: index === 0 ? 0 : 8,
                padding: "0 13px",
                borderRadius: 13,
                border: `1px solid ${
                  active
                    ? "rgba(148, 163, 184, 0.2)"
                    : "rgba(148, 163, 184, 0.1)"
                }`,
                backgroundColor: active
                  ? "rgba(248, 250, 252, 0.055)"
                  : "rgba(248, 250, 252, 0.018)",
                opacity: active ? 1 : 0.4,
              }}
            >
              <div
                style={{
                  width: 25,
                  height: 25,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  color: index === 4 ? OG_COLORS.amber : OG_COLORS.foreground,
                  backgroundColor:
                    index === 4
                      ? "rgba(251, 191, 36, 0.13)"
                      : "rgba(148, 163, 184, 0.12)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </div>
              <div
                style={{
                  display: "flex",
                  marginLeft: 12,
                  color: active ? OG_COLORS.foreground : OG_COLORS.muted,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  width: 5,
                  height: 5,
                  marginLeft: "auto",
                  borderRadius: 999,
                  backgroundColor: active ? OG_COLORS.sky : OG_COLORS.muted,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OgPill({
  children,
  accent = OG_COLORS.muted,
}: {
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 13px",
        borderRadius: 999,
        border: `1px solid ${accent}55`,
        color: accent,
        backgroundColor: `${accent}14`,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </div>
  );
}
