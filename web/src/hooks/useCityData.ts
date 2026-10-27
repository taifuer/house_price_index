import { useEffect, useMemo, useState } from "react";
import { loadShard } from "../lib/data";
import type { DatasetShard, Manifest } from "../types";

export function useCityData(manifest: Manifest, sizeBand: string) {
  const descriptors = useMemo(() => manifest.datasets.filter((dataset) => dataset.sizeBand === sizeBand), [manifest, sizeBand]);
  const [loaded, setLoaded] = useState<Record<string, DatasetShard>>({});
  const [failures, setFailures] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    setFailures([]);
    setChecking(true);
    // The shared loader limits concurrency and reuses successful shards on retry.
    void Promise.all(descriptors.map(async (descriptor) => {
      try {
        const shard = await loadShard(descriptor, manifest);
        if (active) setLoaded((current) => ({ ...current, [descriptor.id]: shard }));
      } catch {
        if (active) setFailures((current) => [...current, descriptor.id]);
      }
    })).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [descriptors, manifest, attempt]);
  return { descriptors, loaded, failures, checking, retry: () => setAttempt((value) => value + 1) };
}
