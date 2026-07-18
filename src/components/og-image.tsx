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

const OG_DITHER = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <filter id="noise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="17" stitchTiles="stitch" />
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.0027 0.0027 0.0027 0 0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#noise)" />
  </svg>
`)}`;

export function OgFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        transform: "scale(2)",
        transformOrigin: "top left",
        color: OG_COLORS.foreground,
        backgroundColor: OG_COLORS.background,
        backgroundImage:
          "linear-gradient(135deg, #080d15 0%, #0e1725 54%, #19160e 100%)",
      }}
    >
      {/* next/image cannot be rendered inside an ImageResponse. */}
      {/* biome-ignore lint/performance/noImgElement: The dither is an embedded SVG. */}
      <img
        alt=""
        src={OG_DITHER}
        width={1200}
        height={630}
        style={{ position: "absolute", inset: 0 }}
      />
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
          borderRadius: 8.25,
          backgroundColor: "#ffffff",
          color: "#000000",
          fontFamily: "system-ui, sans-serif",
          fontSize: 27.5,
          fontWeight: 700,
          lineHeight: 1,
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
