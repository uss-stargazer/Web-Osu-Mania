import queryString from "query-string";
import type { Settings } from "@/stores/settingsStore";
import { BEATMAP_API_PROVIDERS } from "./settingsStore";

type DownloadSettings = Pick<
  Settings,
  "beatmapProvider" | "customBeatmapProvider" | "proxyBeatmapDownloads"
>;
export type SetDownloadPercent = (percent: number) => void;

export async function downloadBeatmapSetFile(
  beatmapSetId: number,
  settings: DownloadSettings,
  setDownloadPercent?: SetDownloadPercent,
): Blob {
  try {
    let apiUrl: string;
    if (settings.beatmapProvider !== "Custom") {
      apiUrl = BEATMAP_API_PROVIDERS[settings.beatmapProvider].replace(
        "$setId",
        beatmapSetId.toString(),
      );
    } else {
      if (!settings.customBeatmapProvider.includes("$setId")) {
        throw new Error("Custom beatmap provider URL is missing $setId.");
      }

      apiUrl = settings.customBeatmapProvider.replace(
        "$setId",
        beatmapSetId.toString(),
      );
    }

    const destinationUrl = queryString.stringifyUrl({
      url: apiUrl,
    });

    const response = await fetch(
      settings.proxyBeatmapDownloads
        ? queryString.stringifyUrl({
            url: "/api/downloadBeatmap",
            query: { destinationUrl },
          })
        : destinationUrl,
      { method: "GET" },
    );

    if (!response.ok || !response.body) {
      const retryAfter = response.headers.get("Retry-After");

      const statusErrorMessages: Record<number, string> = {
        400: "Invalid beatmap set ID.",
        404: "Beatmap does not exist on the current beatmap provider, please switch to another provider in the settings.",
        410: "Beatmap is not available on the current beatmap provider, please switch to another provider in the settings.",
        429: `The beatmap provider is experiencing too many requests, please try again ${retryAfter ? `after ${retryAfter} seconds` : "later"} or switch to another provider in the settings.`,
        500: "The beatmap provider ran into an error, try again later or switch to another provider in the settings.",
        503: "The beatmap provider is currently unavailable, try again later or switch to another provider in the settings.",
        504: "Download request timed out.",
      };

      const errorMessage = statusErrorMessages[response.status];
      throw new Error(
        errorMessage ||
          "An unknown error occurred while trying to download the beatmap, try again later or try switching to another beatmap provider in the settings.",
      );
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    const contentLength = Number(response.headers.get("Content-Length"));
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;
      if (setDownloadPercent)
        setDownloadPercent((receivedLength / contentLength) * 100);
    }

    return new Blob(chunks as BlobPart[]);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "An unknown error occurred while trying to download the beatmap, try again later or try switching to another beatmap provider in the settings.",
      );
    }

    throw error;
  }
}
