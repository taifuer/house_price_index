from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from housing_constants import TIER_MAP


DEFAULT_DATA_PATH = Path("data/house_price_index_all.csv.gz")
PERIOD_RE = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")
SHANGHAI_TIMEZONE = ZoneInfo("Asia/Shanghai")
TABLE_DIMENSIONS = {
    "1": ("新建商品住宅", ("全部",)),
    "2": ("二手住宅", ("全部",)),
    "3": ("新建商品住宅", ("90m2及以下", "90-144m2", "144m2以上")),
    "4": ("二手住宅", ("90m2及以下", "90-144m2", "144m2以上")),
}
CITY_NAMES = tuple(TIER_MAP)


@dataclass(frozen=True)
class PeriodStatus:
    target_period: str
    period_label: str
    latest_period: str | None
    record_count: int
    expected_record_count: int
    complete: bool
    final_check: bool
    problems: tuple[str, ...]


def previous_month(reference_date: date) -> str:
    year = reference_date.year
    month = reference_date.month - 1
    if month == 0:
        year -= 1
        month = 12
    return f"{year:04d}-{month:02d}"


def period_label(period: str) -> str:
    validate_period(period)
    year, month = period.split("-", 1)
    return f"{year}年{int(month)}月"


def validate_period(period: str) -> None:
    if not PERIOD_RE.fullmatch(period):
        raise ValueError(f"月份格式无效：{period}，应为 YYYY-MM")


def expected_record_count(period: str) -> int:
    return 1120 if period.endswith("-01") else 1680


def csv_text_reader(path: Path):
    if path.suffix == ".gz":
        return gzip.open(path, "rt", newline="", encoding="utf-8-sig")
    return path.open("r", newline="", encoding="utf-8-sig")


def expected_keys(period: str) -> set[tuple[str, str, str, str, str]]:
    metrics = ("环比", "同比") if period.endswith("-01") else ("环比", "同比", "累计平均")
    return {
        (table_no, house_type, size_band, city, metric)
        for table_no, (house_type, size_bands) in TABLE_DIMENSIONS.items()
        for size_band in size_bands
        for city in CITY_NAMES
        for metric in metrics
    }


def validate_period_records(records: list[dict[str, str]], period: str) -> list[str]:
    validate_period(period)
    problems: list[str] = []
    expected_count = expected_record_count(period)
    if len(records) != expected_count:
        problems.append(f"记录数为 {len(records)}，预期 {expected_count}")
    if not records:
        return problems

    keys = [
        (
            str(record.get("table_no", "")),
            str(record.get("house_type", "")),
            str(record.get("size_band", "")),
            str(record.get("city", "")),
            str(record.get("metric", "")),
        )
        for record in records
    ]
    duplicate_count = sum(count - 1 for count in Counter(keys).values() if count > 1)
    if duplicate_count:
        problems.append(f"存在 {duplicate_count} 条重复维度记录")

    expected = expected_keys(period)
    observed = set(keys)
    missing_count = len(expected - observed)
    unexpected_count = len(observed - expected)
    if missing_count:
        problems.append(f"缺少 {missing_count} 个表格/住宅/面积/城市/指标组合")
    if unexpected_count:
        problems.append(f"存在 {unexpected_count} 个非预期维度组合")

    urls = {str(record.get("source_url", "")).strip() for record in records}
    titles = {str(record.get("title", "")).strip() for record in records}
    if len(urls) != 1 or "" in urls:
        problems.append("来源 URL 不唯一或为空")
    elif not next(iter(urls)).startswith("https://www.stats.gov.cn/"):
        problems.append("来源 URL 不是国家统计局 HTTPS 地址")
    if len(titles) != 1 or "" in titles:
        problems.append("来源标题不唯一或为空")

    invalid_values = 0
    inconsistent_changes = 0
    for record in records:
        try:
            value = float(record.get("value", ""))
            change = float(record.get("change_pct", ""))
        except (TypeError, ValueError):
            invalid_values += 1
            continue
        if not math.isfinite(value) or not math.isfinite(change):
            invalid_values += 1
        elif not math.isclose(change, value - 100, abs_tol=0.051):
            inconsistent_changes += 1
    if invalid_values:
        problems.append(f"存在 {invalid_values} 条无效数值")
    if inconsistent_changes:
        problems.append(f"存在 {inconsistent_changes} 条指数与涨跌幅不一致记录")
    return problems


def inspect_data_file(
    data_path: Path,
    target_period: str,
    *,
    reference_date: date,
) -> PeriodStatus:
    validate_period(target_period)
    latest_period: str | None = None
    target_records: list[dict[str, str]] = []
    with csv_text_reader(data_path) as file:
        for record in csv.DictReader(file):
            record_period = str(record.get("period", ""))
            if not PERIOD_RE.fullmatch(record_period):
                raise ValueError(f"源数据包含无效月份：{record_period!r}")
            if latest_period is None or record_period > latest_period:
                latest_period = record_period
            if record_period == target_period:
                target_records.append(record)

    problems = validate_period_records(target_records, target_period)
    return PeriodStatus(
        target_period=target_period,
        period_label=period_label(target_period),
        latest_period=latest_period,
        record_count=len(target_records),
        expected_record_count=expected_record_count(target_period),
        complete=not problems,
        final_check=reference_date.day >= 21,
        problems=tuple(problems),
    )


def write_github_output(path: Path, status: PeriodStatus) -> None:
    outputs = {
        "target_period": status.target_period,
        "period_label": status.period_label,
        "latest_period": status.latest_period or "",
        "record_count": str(status.record_count),
        "expected_record_count": str(status.expected_record_count),
        "complete": str(status.complete).lower(),
        "final_check": str(status.final_check).lower(),
        "problems_json": json.dumps(status.problems, ensure_ascii=False),
    }
    with path.open("a", encoding="utf-8") as file:
        for key, value in outputs.items():
            file.write(f"{key}={value}\n")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="检查月度房价源数据是否完整可发布")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA_PATH, help="长表 CSV 或 CSV.GZ")
    parser.add_argument("--period", help="目标月份，默认按上海时区取上月")
    parser.add_argument("--reference-date", type=date.fromisoformat, help="覆盖当前日期，供回归测试使用")
    parser.add_argument("--github-output", type=Path, help="追加 GitHub Actions step outputs")
    parser.add_argument("--require-complete", action="store_true", help="数据不完整时返回非零状态")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    reference_date = args.reference_date or datetime.now(SHANGHAI_TIMEZONE).date()
    target_period = args.period or previous_month(reference_date)
    status = inspect_data_file(args.data, target_period, reference_date=reference_date)
    print(json.dumps(asdict(status), ensure_ascii=False, indent=2))
    if args.github_output:
        write_github_output(args.github_output, status)
    return 1 if args.require_complete and not status.complete else 0


if __name__ == "__main__":
    raise SystemExit(main())
