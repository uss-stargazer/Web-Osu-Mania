import { idb } from "@/lib/idb";
import { createSelectors } from "@/lib/zustand";
import { enableMapSet } from "immer";
import { toast } from "sonner";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { useSettingsStore } from "./settingsStore";
import {
  downloadBeatmapSetFile,
  type SetDownloadPercent,
} from "@/lib/beatmapDownload";

type BeatmapSetCacheState = {
  beatmapSetCache: Map<number, Blob>;
  getBeatmapSet: (
    beatmapSetId: number,
    setDownloadPercent: SetDownloadPercent,
  ) => Promise<Blob>;
};

enableMapSet();

const useBeatmapSetCacheStoreBase = create<BeatmapSetCacheState>()(
  immer((set, get) => ({
    beatmapSetCache: new Map(),

    getBeatmapSet: async (beatmapSetId, setDownloadPercent) => {
      let beatmapSetFile = get().beatmapSetCache.get(beatmapSetId);

      // If not cached, download and cache it
      if (!beatmapSetFile) {
        const settings = useSettingsStore.getState();

        beatmapSetFile = await downloadBeatmapSetFile(
          beatmapSetId,
          settings,
          setDownloadPercent,
        );
        set((state) => state.beatmapSetCache.set(beatmapSetId, beatmapSetFile));
      }

      return beatmapSetFile;
    },
  })),
);

export const useBeatmapSetCacheStore = createSelectors(
  useBeatmapSetCacheStoreBase,
);
