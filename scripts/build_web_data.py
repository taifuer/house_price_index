from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from housing_constants import METRIC_ORDER, SIZE_BAND_ORDER, TIER_MAP


DEFAULT_INPUT = Path("data/house_price_index_all.csv.gz")
DEFAULT_OUTPUT = Path("web/public/data")
REQUIRED_COLUMNS = {
    "period",
    "house_type",
    "size_band",
    "city",
    "metric",
    "value",
    "source_url",
    "title",
}
HOUSE_TYPE_ORDER = ("新建商品住宅", "二手住宅")
HOUSE_TYPE_SLUGS = {"新建商品住宅": "new", "二手住宅": "resale"}
SIZE_BAND_SLUGS = {
    "全部": "all",
    "90m2及以下": "under-90",
    "90-144m2": "90-144",
    "144m2以上": "over-144",
}
METRIC_SLUGS = {"环比": "mom", "同比": "yoy", "累计平均": "average"}


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(compact_json(value), encoding="utf-8")
    temporary_path.replace(path)


def ordered_existing(values: pd.Series, preferred: tuple[str, ...]) -> list[str]:
    existing = set(values.dropna().astype(str))
    ordered = [value for value in preferred if value in existing]
    ordered.extend(sorted(existing - set(ordered)))
    return ordered


def dataset_id(house_type: str, size_band: str, metric: str) -> str:
    try:
        return "-".join(
            [
                HOUSE_TYPE_SLUGS[house_type],
                SIZE_BAND_SLUGS[size_band],
                METRIC_SLUGS[metric],
            ]
        )
    except KeyError as error:
        raise ValueError(f"缺少静态数据文件名映射：{error.args[0]}") from error


def complete_months(start: str, end: str) -> list[str]:
    start_period = pd.Period(start, freq="M")
    end_period = pd.Period(end, freq="M")
    return [str(period) for period in pd.period_range(start_period, end_period, freq="M")]


def validate_source(frame: pd.DataFrame) -> pd.DataFrame:
    missing_columns = sorted(REQUIRED_COLUMNS - set(frame.columns))
    if missing_columns:
        raise ValueError(f"源数据缺少字段：{', '.join(missing_columns)}")

    data = frame.copy()
    data["period"] = data["period"].astype(str)
    data["value"] = pd.to_numeric(data["value"], errors="coerce")
    data = data.dropna(subset=["value"])

    unknown_cities = sorted(set(data["city"].astype(str)) - set(TIER_MAP))
    if unknown_cities:
        raise ValueError(f"城市层级配置缺失：{', '.join(unknown_cities)}")

    key_columns = ["period", "house_type", "size_band", "metric", "city"]
    duplicate_rows = data.duplicated(key_columns, keep=False)
    if duplicate_rows.any():
        sample = data.loc[duplicate_rows, key_columns].head(5).to_dict("records")
        raise ValueError(f"静态数据键重复：{sample}")
    return data


def build_web_data(frame: pd.DataFrame, output_dir: Path) -> dict[str, Any]:
    data = validate_source(frame)
    cities = list(TIER_MAP)
    city_records = [{"name": city, "tier": TIER_MAP[city]} for city in cities]
    house_types = ordered_existing(data["house_type"], HOUSE_TYPE_ORDER)
    size_bands = ordered_existing(data["size_band"], SIZE_BAND_ORDER)
    metrics = ordered_existing(data["metric"], METRIC_ORDER)
    datasets: list[dict[str, Any]] = []
    emitted_records = 0

    shard_dir = output_dir / "shards"
    shard_dir.mkdir(parents=True, exist_ok=True)
    for stale_path in shard_dir.glob("*.json"):
        stale_path.unlink()

    for house_type in house_types:
        for size_band in size_bands:
            for metric in metrics:
                scoped = data[
                    (data["house_type"] == house_type)
                    & (data["size_band"] == size_band)
                    & (data["metric"] == metric)
                ].copy()
                if scoped.empty:
                    continue

                periods = sorted(scoped["period"].unique())
                matrix = scoped.pivot(index="period", columns="city", values="value").reindex(
                    index=periods,
                    columns=cities,
                )
                values = [
                    [None if pd.isna(value) else round(float(value), 1) for value in row]
                    for row in matrix.to_numpy()
                ]
                period_coverage = matrix.notna().sum(axis=1).astype(int).tolist()
                full_periods = complete_months(periods[0], periods[-1])
                complete_periods = [
                    period
                    for period, count in zip(periods, period_coverage, strict=True)
                    if count == len(cities)
                ]
                coverage = {
                    "firstPeriod": periods[0],
                    "lastPeriod": periods[-1],
                    "publishedMonths": len(periods),
                    "completeMonths": len(complete_periods),
                    "partialMonths": sum(0 < count < len(cities) for count in period_coverage),
                    "unpublishedMonths": len(full_periods) - len(periods),
                    "lastCompletePeriod": complete_periods[-1] if complete_periods else None,
                }
                source_rows: list[dict[str, str]] = []
                for period in periods:
                    period_rows = scoped[scoped["period"] == period]
                    urls = period_rows["source_url"].dropna().astype(str).unique().tolist()
                    titles = period_rows["title"].dropna().astype(str).unique().tolist()
                    if len(urls) != 1 or len(titles) != 1:
                        raise ValueError(
                            f"{house_type}/{size_band}/{metric}/{period} 来源信息不唯一"
                        )
                    source_rows.append({"url": urls[0], "title": titles[0]})

                current_id = dataset_id(house_type, size_band, metric)
                record_count = int(matrix.notna().sum().sum())
                emitted_records += record_count
                shard = {
                    "schemaVersion": 1,
                    "id": current_id,
                    "periods": periods,
                    "sources": source_rows,
                    "values": values,
                    "recordCount": record_count,
                }
                relative_path = f"shards/{current_id}.json"
                write_json(output_dir / relative_path, shard)
                datasets.append(
                    {
                        "id": current_id,
                        "houseType": house_type,
                        "sizeBand": size_band,
                        "metric": metric,
                        "path": relative_path,
                        "periods": periods,
                        "periodCoverage": period_coverage,
                        "recordCount": record_count,
                        "coverage": coverage,
                    }
                )

    if emitted_records != len(data):
        raise ValueError(f"静态分片记录数 {emitted_records} 与源数据 {len(data)} 不一致")

    default_id = dataset_id("二手住宅", "全部", "环比")
    if default_id not in {dataset["id"] for dataset in datasets}:
        default_id = datasets[0]["id"]
    manifest = {
        "schemaVersion": 2,
        "generatedAt": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "title": "全国 70 城商品住宅价格指数",
        "recordCount": len(data),
        "periodRange": [str(data["period"].min()), str(data["period"].max())],
        "defaultDataset": default_id,
        "cities": city_records,
        "dimensions": {
            "houseTypes": house_types,
            "sizeBands": size_bands,
            "metrics": metrics,
        },
        "datasets": datasets,
    }
    write_json(output_dir / "manifest.json", manifest)
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="为静态住宅价格前端生成紧凑数据分片")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="长表 CSV 或 CSV.GZ")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT, help="静态数据输出目录")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    frame = pd.read_csv(args.input)
    manifest = build_web_data(frame, args.out)
    shard_bytes = sum(path.stat().st_size for path in (args.out / "shards").glob("*.json"))
    print(
        f"写入 {len(manifest['datasets'])} 个数据分片，"
        f"共 {manifest['recordCount']} 条记录，{shard_bytes / 1024:.1f} KiB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
