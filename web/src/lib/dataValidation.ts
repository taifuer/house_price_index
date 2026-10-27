import type { DatasetDescriptor, DatasetShard, Manifest } from "../types";

const houses = ["新建商品住宅", "二手住宅"];
const bands = ["全部", "90m2及以下", "90-144m2", "144m2以上"];
const metrics = ["环比", "同比", "累计平均"];
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthIndex = (period: string) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5));

function ensure(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`数据校验失败：${detail}`);
}

function record(value: unknown): Record<string, unknown> {
  ensure(value && typeof value === "object" && !Array.isArray(value), "对象格式异常");
  return value as Record<string, unknown>;
}

function periods(value: unknown): asserts value is string[] {
  ensure(Array.isArray(value) && value.length > 0 && value.length <= 600, "月份数量异常");
  ensure(value.every((p, i) => typeof p === "string" && monthPattern.test(p) && (!i || p > value[i - 1])), "月份顺序异常");
}

export function validateManifest(input: unknown): Manifest {
  const m = record(input);
  ensure(m.schemaVersion === 2, "不支持的数据版本");
  ensure(typeof m.generatedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(m.generatedAt) && Number.isFinite(Date.parse(m.generatedAt)), "更新时间异常");
  ensure(typeof m.title === "string" && m.title.length <= 200, "标题异常");
  ensure(Array.isArray(m.periodRange) && m.periodRange.length === 2 && m.periodRange.every((p) => typeof p === "string" && monthPattern.test(p)), "数据范围异常");
  const [first, last] = m.periodRange as string[];
  ensure(first! <= last! && monthIndex(last!) - monthIndex(first!) < 600, "数据范围异常");
  ensure(Array.isArray(m.cities) && m.cities.length === 70, "城市数量异常");
  const cities = m.cities.map(record);
  ensure(cities.every((c) => typeof c.name === "string" && /^[\u4e00-\u9fff]{2,6}$/.test(c.name) && ["一线", "二线", "三线"].includes(String(c.tier))), "城市信息异常");
  ensure(new Set(cities.map((c) => c.name)).size === 70, "城市重复");
  const dimensions = record(m.dimensions);
  for (const [key, values] of [["houseTypes", houses], ["sizeBands", bands], ["metrics", metrics]] as const) {
    ensure(JSON.stringify(dimensions[key]) === JSON.stringify(values), "数据口径异常");
  }
  ensure(Array.isArray(m.datasets) && m.datasets.length === 24, "数据分片数量异常");
  const datasets = m.datasets.map(record);
  let total = 0;
  for (const d of datasets) {
    const h = houses.indexOf(String(d.houseType)), b = bands.indexOf(String(d.sizeBand)), metric = metrics.indexOf(String(d.metric));
    ensure(h >= 0 && b >= 0 && metric >= 0, "分片口径异常");
    const id = `${["new", "resale"][h]}-${["all", "under-90", "90-144", "over-144"][b]}-${["mom", "yoy", "average"][metric]}`;
    ensure(d.id === id && d.path === `shards/${id}.json`, "分片路径异常");
    periods(d.periods);
    ensure(d.periods[0]! >= first! && d.periods.at(-1)! <= last!, "分片超出数据范围");
    ensure(Array.isArray(d.periodCoverage) && d.periodCoverage.length === d.periods.length && d.periodCoverage.every((n) => Number.isInteger(n) && n >= 0 && n <= 70), "月份覆盖数量异常");
    const coverage = d.periodCoverage as number[];
    const count = coverage.reduce((sum, n) => sum + n, 0);
    ensure(d.recordCount === count, "记录数量不一致");
    total += count;
    const c = record(d.coverage), complete = coverage.filter((n) => n === 70).length;
    ensure(c.firstPeriod === d.periods[0] && c.lastPeriod === d.periods.at(-1)
      && c.publishedMonths === d.periods.length && c.completeMonths === complete
      && c.partialMonths === coverage.filter((n) => n > 0 && n < 70).length
      && c.unpublishedMonths === monthIndex(d.periods.at(-1)!) - monthIndex(d.periods[0]!) + 1 - d.periods.length
      && c.lastCompletePeriod === (d.periods.filter((_, i) => coverage[i] === 70).at(-1) ?? null), "覆盖摘要不一致");
  }
  ensure(new Set(datasets.map((d) => d.id)).size === 24, "分片重复");
  ensure(datasets.some((d) => d.id === m.defaultDataset), "默认分片不存在");
  ensure(m.recordCount === total, "总记录数量不一致");
  return input as Manifest;
}

export function validateShard(input: unknown, descriptor: DatasetDescriptor, cityCount: number): DatasetShard {
  const s = record(input);
  ensure(s.schemaVersion === 1 && s.id === descriptor.id, "分片标识异常");
  periods(s.periods);
  ensure(JSON.stringify(s.periods) === JSON.stringify(descriptor.periods), "分片月份与清单不一致");
  ensure(Array.isArray(s.values) && s.values.length === s.periods.length, "数据行数异常");
  let count = 0;
  s.values.forEach((row: unknown, i: number) => {
    ensure(Array.isArray(row) && row.length === cityCount && row.every((n) => n === null || (typeof n === "number" && Number.isFinite(n) && n > 0)), "城市数值异常");
    const covered = row.filter((n) => n !== null).length;
    ensure(covered === descriptor.periodCoverage[i], "分片覆盖数量与清单不一致");
    count += covered;
  });
  ensure(s.recordCount === count && descriptor.recordCount === count, "分片记录数量不一致");
  ensure(Array.isArray(s.sources) && s.sources.length === s.periods.length, "来源行数异常");
  s.sources.forEach((value: unknown) => {
    const source = record(value);
    ensure(typeof source.url === "string" && source.url.length < 2048 && !/[\s\\]/.test(source.url), "来源链接异常");
    const url = new URL(source.url);
    ensure(url.protocol === "https:" && !url.username && !url.password && !url.port
      && (url.hostname === "stats.gov.cn" || url.hostname.endsWith(".stats.gov.cn")), "来源不是统计局网站");
    ensure(typeof source.title === "string" && source.title.length <= 500, "来源标题异常");
  });
  return input as DatasetShard;
}
