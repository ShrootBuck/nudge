import type { Metadata } from "next";

export const SITE_NAME = "Nudge";
export const SITE_DESCRIPTION =
  "Progressive hints, clean editorials, and full C++ solutions for Codeforces problems.";

export const OG_IMAGE_SIZE = {
  width: 2400,
  height: 1260,
} as const;

type SocialImage = {
  url: string;
  width: number;
  height: number;
  alt: string;
  type: "image/png";
};

export const DEFAULT_SOCIAL_IMAGE: SocialImage = {
  url: "/opengraph-image",
  ...OG_IMAGE_SIZE,
  alt: "Nudge - progressive Codeforces hints without the spoilers",
  type: "image/png",
};

export function createPageMetadata({
  title,
  description,
  path,
  image = DEFAULT_SOCIAL_IMAGE,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  path: string;
  image?: SocialImage;
  absoluteTitle?: boolean;
}): Metadata {
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "en_US",
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
