from __future__ import annotations

from collections.abc import Mapping, Sequence

import pandas as pd


TREND_TIERS = ("一线", "二线", "三线")


def complete_month_index(frame: pd.DataFrame) -> list[str]:
    if frame.empty:
        return []
    return pd.period_range(frame["period"].min(), frame["period"].max(), freq="M").astype(str).tolist()


def build_overall_trend(frame: pd.DataFrame, expected_city_count: int) -> pd.DataFrame:
    periods = complete_month_index(frame)
    if not periods:
        return pd.DataFrame()

    monthly = frame.groupby("period").agg(
        covered=("city", "nunique"),
        up=("change_pct", lambda values: int((values > 0).sum())),
        flat=("change_pct", lambda values: int((values == 0).sum())),
        down=("change_pct", lambda values: int((values < 0).sum())),
    )
    monthly = monthly.reindex(periods).rename_axis("period").reset_index()
    for column in ("covered", "up", "flat", "down"):
        monthly[column] = monthly[column].fillna(0).astype(int)
    monthly["data_status"] = monthly["covered"].map(
        lambda count: "数据完整" if count == expected_city_count else "数据不完整"
    )
    return monthly


def build_tier_trend(
    frame: pd.DataFrame,
    expected_tier_counts: Mapping[str, int],
    tiers: Sequence[str] = TREND_TIERS,
) -> pd.DataFrame:
    periods = complete_month_index(frame)
    visible_tiers = [tier for tier in tiers if expected_tier_counts.get(tier, 0) > 0]
    if not periods or not visible_tiers:
        return pd.DataFrame()

    scoped = frame[frame["city_tier"].isin(visible_tiers)]
    counts = (
        scoped.groupby(["city_tier", "period"], observed=True)
        .agg(
            covered=("city", "nunique"),
            up=("change_pct", lambda values: int((values > 0).sum())),
            flat=("change_pct", lambda values: int((values == 0).sum())),
            down=("change_pct", lambda values: int((values < 0).sum())),
        )
        .reset_index()
    )

    complete_index = pd.MultiIndex.from_product(
        [visible_tiers, periods], names=["city_tier", "period"]
    )
    counts = counts.set_index(["city_tier", "period"]).reindex(complete_index).reset_index()
    for column in ("covered", "up", "flat", "down"):
        counts[column] = counts[column].fillna(0).astype(int)

    counts["expected"] = counts["city_tier"].map(expected_tier_counts).astype(int)
    for direction in ("up", "flat", "down"):
        counts[f"{direction}_pct"] = counts[direction] / counts["expected"] * 100
    counts["data_status"] = counts.apply(
        lambda row: "数据完整" if row["covered"] == row["expected"] else "数据不完整",
        axis=1,
    )
    return counts
