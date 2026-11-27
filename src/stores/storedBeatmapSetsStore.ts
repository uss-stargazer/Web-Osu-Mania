import type { BeatmapSet } from "@/lib/osuApi";
import { useSettingsStore } from "./settingsStore";
import { simpleDeepEquals } from "@/lib/utils";
import { createIdbStorage, createSelectors } from "@/lib/zustand";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { idb } from "@/lib/idb";
import {
  downloadBeatmapSetFile,
  type SetDownloadPercent,
} from "@/lib/beatmapDownload";
import { toast } from "sonner";

type StoredBeatmapSetsState = {
  storedBeatmapSets: BeatmapSet[];
  actions: {
    storeBeatmapSet: (
      beatmapSet: BeatmapSet,
      setDownloadPercent: SetDownloadPercent,
    ) => Promise<void>;
    deleteBeatmapSet: (beatmapSetId: number) => Promise<void>;
    clearBeatmapSets: () => Promise<void>;

    getBeatmapSet: (beatmapSetId: number) => BeatmapSet | undefined;
    getBeatmapSetFile: (beatmapSetId: number) => Promise<Blob | undefined>;
    getIdbUsage: () => Promise<number>;
  };
};

/**
 * Acts as interface for stored beatmaps. Writes BeatmapSet metadata for stored
 * beatmaps to storedBeatmapSets in idb, while also updating the actual beatmap
 * set files in idb so they don't get out of sync.
 */
const useStoredBeatmapSetsStoreBase = create<StoredBeatmapSetsState>()(
  persist(
    immer((set, get) => ({
      storedBeatmapSets: [],

      actions: {
        getBeatmapSet: (beatmapSetId) => {
          return get().storedBeatmapSets.find(
            (set) => (set) => set.id === beatmapSetId,
          );
        },

        storeBeatmapSet: async (beatmapSet, setDownloadPercent) => {
          // If already stored, only download and overwrite if outdated
          const existing = get().actions.getBeatmapSet(beatmapSet.id);
          if (existing) {
            if (simpleDeepEquals(existing, beatmapSet)) {
              return;
            } else {
              get().actions.deleteBeatmapSet(existing.id);
            }
          }

          // Download and store beatmap set file
          const settings = useSettingsStore.getState();
          const beatmapSetFile = await downloadBeatmapSetFile(
            beatmapSet.id,
            settings,
            setDownloadPercent,
          );
          try {
            await idb.putBeatmapSet(beatmapSet.id, beatmapSetFile);
          } catch (error) {
            toast("Warning", {
              description:
                "IDB Storage quota exceeded, cache purged. Refresh when you can.",
              duration: 10000,
            });
          }

          // Update storedBeatmapSets
          set((state) => state.storedBeatmapSets.push(beatmapSet));
        },

        deleteBeatmapSet: async (beatmapSetId: number) => {
          await idb.deleteBeatmap(beatmapSetId);
          set((state) => {
            const idx = state.storedBeatmapSets.findIndex(
              (set) => set.id === beatmapSetId,
            );
            state.storedBeatmapSets.splice(idx, 1);
          });
        },

        clearBeatmapSets: async () => {
          await idb.clearBeatmapSets();
          set((state) => {
            state.storedBeatmapSets = [];
          });
        },

        getBeatmapSetFile: async (beatmapSetId) => {
          if (!get().actions.getBeatmapSet(beatmapSetId)) return undefined;

          const beatmapSet = await idb.getBeatmap(beatmapSetId);
          return beatmapSet?.file;
        },

        getIdbUsage: async () => {
          const beatmapCount = await idb.getBeatmapCount();

          if (beatmapCount === 0) {
            return 0;
          }

          if (!navigator.storage) {
            throw new Error(
              "This device does not support IDB cache usage estimation.",
            );
          }

          const storage = await navigator.storage.estimate();

          if (!storage.usage) {
            throw new Error("Could not determine IDB cache usage.");
          }

          return storage.usage;
        },
      },
    })),
    {
      name: "storedBeatmapSets",
      storage: createIdbStorage(),
    },
  ),
);

export const useStoredBeatmapSetsStore = createSelectors(
  useStoredBeatmapSetsStoreBase,
);
