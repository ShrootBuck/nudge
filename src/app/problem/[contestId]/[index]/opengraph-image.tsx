import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import {
  HintLadder,
  OG_COLORS,
  OgBrand,
  OgFrame,
  OgPill,
} from "@/components/og-image";
import { getProblemSocialData } from "@/lib/problem-read-cache";
import { formatProblemId, parseProblemRouteParams } from "@/lib/problem-social";
import { OG_IMAGE_SIZE } from "@/lib/site-metadata";

export const alt = "Codeforces problem hints and editorial on Nudge";
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

function ratingColor(rating: number | null) {
  if (rating === null) return OG_COLORS.muted;
  if (rating < 1200) return "#a1a1aa";
  if (rating < 1400) return "#4ade80";
  if (rating < 1600) return "#22d3ee";
  if (rating < 1900) return "#60a5fa";
  if (rating < 2100) return "#c084fc";
  if (rating < 2400) return "#fb923c";
  return "#fb7185";
}

function titleFontSize(name: string) {
  if (name.length > 80) return 38;
  if (name.length > 58) return 44;
  if (name.length > 40) return 50;
  if (name.length > 27) return 57;
  return 64;
}

function reviewBadge(problem: { runState: string; reviewStatus: string }) {
  if (problem.runState !== "SUCCEEDED") {
    return {
      label: problem.runState === "RUNNING" ? "GENERATING" : "CONTENT PENDING",
      color: OG_COLORS.amber,
    };
  }

  switch (problem.reviewStatus) {
    case "VERIFIED":
      return { label: "VERIFIED", color: "#34d399" };
    case "INCORRECT":
      return { label: "MARKED INCORRECT", color: "#fb7185" };
    case "UNSOLVABLE":
      return { label: "UNSOLVABLE", color: OG_COLORS.amber };
    default:
      return { label: "AI GENERATED", color: OG_COLORS.muted };
  }
}

function visibleTags(tags: string[]) {
  const visible: string[] = [];
  let characterCount = 0;

  for (const tag of tags) {
    if (visible.length >= 4 || characterCount + tag.length > 46) break;
    visible.push(tag);
    characterCount += tag.length;
  }

  return visible;
}

export default async function ProblemOpenGraphImage({
  params,
}: {
  params: Promise<{ contestId: string; index: string }>;
}) {
  const route = parseProblemRouteParams(await params);
  if (!route) notFound();

  const problem = await getProblemSocialData(route.contestId, route.index);
  if (!problem) notFound();

  const problemId = formatProblemId(problem.contestId, problem.index);
  const tags = visibleTags(problem.tags);
  const hiddenTagCount = problem.tags.length - tags.length;
  const review = reviewBadge(problem);
  const features = [
    `${problem.hintCount} progressive hint${problem.hintCount === 1 ? "" : "s"}`,
    problem.hasEditorial ? "Editorial ready" : "Editorial pending",
    problem.hasSolution ? "C++ solution ready" : "Solution pending",
  ];

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
            alignItems: "center",
            color: OG_COLORS.muted,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.14em",
          }}
        >
          CODEFORCES
          <div
            style={{
              display: "flex",
              marginLeft: 10,
              color: OG_COLORS.foreground,
              fontSize: 16,
              letterSpacing: "0.04em",
            }}
          >
            {problemId}
          </div>
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
            width: 740,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <OgPill accent={ratingColor(problem.rating)}>
              {problem.rating === null ? "UNRATED" : `RATING ${problem.rating}`}
            </OgPill>
            <div style={{ display: "flex", marginLeft: 10 }}>
              <OgPill accent={review.color}>{review.label}</OgPill>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 23,
              color: OG_COLORS.sky,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.18em",
            }}
          >
            PROBLEM {problemId}
          </div>
          <div
            style={{
              width: 730,
              maxHeight: 205,
              display: "flex",
              marginTop: 10,
              overflow: "hidden",
              fontSize: titleFontSize(problem.name),
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1.04,
            }}
          >
            {problem.name}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 22,
            }}
          >
            {tags.map((tag, index) => (
              <div
                key={tag}
                style={{
                  display: "flex",
                  padding: "7px 11px",
                  marginLeft: index === 0 ? 0 : 8,
                  borderRadius: 999,
                  border: `1px solid ${OG_COLORS.border}`,
                  color: "#cbd5e1",
                  backgroundColor: "rgba(248, 250, 252, 0.04)",
                  fontSize: 12,
                }}
              >
                {tag}
              </div>
            ))}
            {hiddenTagCount > 0 ? (
              <div
                style={{
                  display: "flex",
                  marginLeft: 9,
                  color: OG_COLORS.muted,
                  fontSize: 12,
                }}
              >
                +{hiddenTagCount} more
              </div>
            ) : null}
          </div>
        </div>

        <HintLadder activeLevels={Math.min(problem.hintCount, 5)} />
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
        <div style={{ display: "flex", alignItems: "center" }}>
          {features.map((feature, index) => (
            <div
              key={feature}
              style={{
                display: "flex",
                alignItems: "center",
                marginLeft: index === 0 ? 0 : 14,
              }}
            >
              {index > 0 ? (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    marginRight: 14,
                    borderRadius: 999,
                    backgroundColor: OG_COLORS.muted,
                  }}
                />
              ) : null}
              {feature}
            </div>
          ))}
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
