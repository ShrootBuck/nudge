import { ImageResponse } from "next/og";
import {
  HintLadder,
  OG_COLORS,
  OgBrand,
  OgFrame,
  OgPill,
} from "@/components/og-image";
import { OG_IMAGE_SIZE } from "@/lib/site-metadata";

export const alt = "Nudge - progressive Codeforces hints without the spoilers";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgFrame>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <OgBrand />
        <div
          style={{
            display: "flex",
            color: OG_COLORS.muted,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.16em",
          }}
        >
          CODEFORCES FIELD NOTES
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 24,
        }}
      >
        <div
          style={{
            width: 700,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex" }}>
            <OgPill accent={OG_COLORS.sky}>NO-SPOILER HELP</OgPill>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 24,
              fontSize: 67,
              fontWeight: 800,
              letterSpacing: "-0.045em",
              lineHeight: 1.02,
            }}
          >
            <div style={{ display: "flex" }}>Get unstuck.</div>
            <div style={{ display: "flex", color: OG_COLORS.amber }}>
              Keep the solve.
            </div>
          </div>
          <div
            style={{
              width: 650,
              display: "flex",
              marginTop: 22,
              color: "#cbd5e1",
              fontSize: 23,
              lineHeight: 1.45,
            }}
          >
            Progressive hints, clean editorials, and full C++ solutions for
            Codeforces problems.
          </div>
        </div>

        <HintLadder />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 18,
          borderTop: `1px solid ${OG_COLORS.border}`,
          color: OG_COLORS.muted,
          fontSize: 13,
        }}
      >
        <div style={{ display: "flex" }}>
          Five levels of help. You decide when to stop.
        </div>
        <div
          style={{
            display: "flex",
            color: OG_COLORS.foreground,
            fontWeight: 700,
          }}
        >
          nudge.zaydkrunz.com
        </div>
      </div>
    </OgFrame>,
    size,
  );
}
