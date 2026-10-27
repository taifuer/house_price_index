/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatasetDescriptor, DatasetShard, Manifest } from "../types";
import manifestJson from "../../public/data/manifest.json";

const manifest = manifestJson as Manifest;
const descriptor = manifest.datasets[0]!;
const fixtures = import.meta.glob<DatasetShard>("../../public/data/shards/*.json", { eager: true, import: "default" });
const shard = (d: DatasetDescriptor) => structuredClone(fixtures[`../../public/data/${d.path}`]!);
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json; charset=utf-8" } });

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("document", { baseURI: "https://example.test/dashboard/" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("data request cache and recovery", () => {
  it("deduplicates manifest requests, evicts a rejection and caches only a valid retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503 })).mockResolvedValueOnce(json(manifest));
    vi.stubGlobal("fetch", fetcher);
    const { loadManifest } = await import("./data");
    const first = loadManifest(); expect(loadManifest()).toBe(first);
    await expect(first).rejects.toThrow("503");
    await expect(loadManifest()).resolves.toEqual(manifest);
    await loadManifest(); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts invalid shards and deduplicates retries without dropping successful data", async () => {
    const invalid = shard(descriptor); invalid.values[0]!.pop();
    const fetcher = vi.fn().mockResolvedValueOnce(json(invalid)).mockResolvedValueOnce(json(shard(descriptor)));
    vi.stubGlobal("fetch", fetcher);
    const { loadShard } = await import("./data");
    await expect(loadShard(descriptor, manifest)).rejects.toThrow("城市数值");
    const retry = loadShard(descriptor, manifest);
    expect(loadShard(descriptor, manifest)).toBe(retry);
    await expect(retry).resolves.toEqual(shard(descriptor));
    await loadShard(descriptor, manifest); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]![0]).toContain(`?v=${encodeURIComponent(manifest.generatedAt)}`);
  });

  it("does not reuse a prior release's cached shard", async () => {
    const fetcher = vi.fn().mockImplementation(async () => json(shard(descriptor)));
    vi.stubGlobal("fetch", fetcher);
    const { loadShard } = await import("./data");
    await loadShard(descriptor, manifest);
    await loadShard(descriptor, { ...manifest, generatedAt: "2026-10-20T12:00:00Z" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("limits all area requests to three in flight and drains the queue after errors", async () => {
    const descriptors = manifest.datasets.slice(0, 9);
    const gates: Array<() => void> = [];
    let active = 0, maximum = 0;
    const fetcher = vi.fn(async (url: string) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => gates.push(resolve));
      active--;
      const d = descriptors.find((d) => new URL(url).pathname.endsWith(d.path))!;
      return d === descriptors[1] ? new Response("unavailable", {status:503}) : json(shard(d));
    });
    vi.stubGlobal("fetch", fetcher);
    const { loadShard, SHARD_CONCURRENCY } = await import("./data");
    const results = Promise.allSettled(descriptors.map((d) => loadShard(d, manifest)));
    expect(fetcher).toHaveBeenCalledTimes(SHARD_CONCURRENCY);
    for (let batch = 1; batch <= 3; batch++) {
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(batch * 3));
      gates.splice(0).forEach((resolve) => resolve());
    }
    expect((await results).filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(maximum).toBe(3);
  });

  it.each([
    () => new Response("<html>error</html>", { headers: {"content-type":"text/html"} }),
    () => new Response("x".repeat(1024*1024+1), { headers: {"content-type":"application/json"} }),
    () => new Response("{invalid}", { headers: {"content-type":"application/json"} }),
  ])("rejects invalid responses and allows a new request", async (response) => {
    const fetcher = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(json(manifest));
    vi.stubGlobal("fetch", fetcher);
    const { loadManifest } = await import("./data");
    await expect(loadManifest()).rejects.toThrow();
    await expect(loadManifest()).resolves.toEqual(manifest);
  });

  it("times out a stalled request and releases its cache entry", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const { loadManifest } = await import("./data");
    const rejection = expect(loadManifest()).rejects.toThrow("超时");
    await vi.advanceTimersByTimeAsync(12_000); await rejection;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(manifest)));
    await expect(loadManifest()).resolves.toEqual(manifest);
  });

  it("cancels oversized streams before downloading the remaining body", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(600_000)); },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } })));
    const { loadManifest } = await import("./data");
    await expect(loadManifest()).rejects.toThrow("大小限制");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("decodes Chinese text correctly across streamed byte boundaries", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(manifest));
    const stream = new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 1021) controller.enqueue(bytes.slice(offset, offset + 1021));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } })));
    const { loadManifest } = await import("./data");
    await expect(loadManifest()).resolves.toEqual(manifest);
  });
});
