import { useEffect, useMemo, useState } from "react";
import { loadShard } from "../lib/data";
import type { DatasetShard, Manifest } from "../types";

export function useCityData(manifest: Manifest, sizeBand: string) {
  const descriptors = useMemo(() => manifest.datasets.filter((dataset) => dataset.sizeBand === sizeBand), [manifest, sizeBand]);
  const [loaded, setLoaded] = useState<Record<string, DatasetShard>>({});
  const [failures, setFailures] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    setFailures([]);
    // One area-band request set supplies the snapshot, both charts and historical rows.
    void (async () => {
      for (const descriptor of descriptors) {
        if (!active) break;
        try {
          const shard = await loadShard(descriptor);
          if (active) setLoaded((current) => ({ ...current, [descriptor.id]: shard }));
        } catch {
          if (active) setFailures((current) => [...current, descriptor.id]);
        }
      }
    })();
    return () => { active = false; };
  }, [descriptors]);
  return { descriptors, loaded, failures };
}
