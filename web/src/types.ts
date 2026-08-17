export type CityTier = "一线" | "二线" | "三线";
export type TrendRange = "all" | "3y" | "5y" | "10y";

export interface CityDefinition {
  name: string;
  tier: CityTier;
}

export interface DatasetDescriptor {
  id: string;
  houseType: string;
  sizeBand: string;
  metric: string;
  path: string;
  periods: string[];
  recordCount: number;
}

export interface Manifest {
  schemaVersion: number;
  title: string;
  recordCount: number;
  periodRange: [string, string];
  defaultDataset: string;
  cities: CityDefinition[];
  dimensions: {
    houseTypes: string[];
    sizeBands: string[];
    metrics: string[];
  };
  datasets: DatasetDescriptor[];
}

export interface SourceDefinition {
  url: string;
  title: string;
}

export interface DatasetShard {
  schemaVersion: number;
  id: string;
  periods: string[];
  sources: SourceDefinition[];
  values: Array<Array<number | null>>;
  recordCount: number;
}

export interface CityDatum {
  city: string;
  tier: CityTier;
  value: number;
  change: number;
  rank: number;
}

export interface OverallTrendDatum {
  period: string;
  up: number;
  flat: number;
  down: number;
  covered: number;
  complete: boolean;
}

export interface TierTrendDatum extends OverallTrendDatum {
  tier: CityTier;
  expected: number;
  upPct: number;
  flatPct: number;
  downPct: number;
}

export interface HistogramBin {
  left: number;
  right: number;
  midpoint: number;
  count: number;
}
