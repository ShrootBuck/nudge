const MAX_CODEFORCES_IMAGE_BYTES = 20 * 1024 * 1024;

type DownloadRequest = {
  url: URL;
  isUrlSupportedByModel: boolean;
};

type DownloadResult = {
  data: Uint8Array;
  mediaType: string | undefined;
};

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function isCodeforcesHost(hostname: string) {
  return hostname === "codeforces.com" || hostname.endsWith(".codeforces.com");
}

function assertCodeforcesImageUrl(url: URL) {
  if (url.protocol !== "https:" || !isCodeforcesHost(url.hostname)) {
    throw new Error(`Refusing to download non-Codeforces image: ${url.href}`);
  }
}

export function createCodexAssetDownloader({
  abortSignal,
  fetchImplementation = fetch,
}: {
  abortSignal?: AbortSignal;
  fetchImplementation?: FetchImplementation;
} = {}) {
  return async (requests: DownloadRequest[]): Promise<DownloadResult[]> =>
    Promise.all(
      requests.map(async ({ url }) => {
        assertCodeforcesImageUrl(url);

        const response = await fetchImplementation(url, {
          headers: {
            "User-Agent":
              "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
          },
          signal: abortSignal,
        });

        if (!response.ok) {
          throw new Error(
            `Failed to download Codeforces image ${url.href}: ${response.status} ${response.statusText}`,
          );
        }

        if (response.redirected && response.url) {
          assertCodeforcesImageUrl(new URL(response.url));
        }

        const contentLength = Number(response.headers.get("content-length"));
        if (
          Number.isFinite(contentLength) &&
          contentLength > MAX_CODEFORCES_IMAGE_BYTES
        ) {
          throw new Error(`Codeforces image is too large: ${url.href}`);
        }

        const data = new Uint8Array(await response.arrayBuffer());
        if (data.byteLength > MAX_CODEFORCES_IMAGE_BYTES) {
          throw new Error(`Codeforces image is too large: ${url.href}`);
        }

        const contentType = response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          ?.trim();

        return {
          data,
          mediaType: contentType?.startsWith("image/")
            ? contentType
            : undefined,
        };
      }),
    );
}
