import unittest

import pandas as pd

from dashboard_trends import build_overall_trend, build_tier_trend


class DashboardTrendTests(unittest.TestCase):
    def setUp(self) -> None:
        self.frame = pd.DataFrame(
            [
                {"period": "2026-01", "city": "北京", "city_tier": "一线", "change_pct": 0.2},
                {"period": "2026-01", "city": "上海", "city_tier": "一线", "change_pct": -0.1},
                {"period": "2026-01", "city": "天津", "city_tier": "二线", "change_pct": 0.0},
                {"period": "2026-03", "city": "北京", "city_tier": "一线", "change_pct": 0.3},
                {"period": "2026-03", "city": "上海", "city_tier": "一线", "change_pct": 0.1},
                {"period": "2026-03", "city": "天津", "city_tier": "二线", "change_pct": -0.2},
            ]
        )

    def test_overall_trend_preserves_missing_months(self) -> None:
        result = build_overall_trend(self.frame, expected_city_count=3)

        self.assertEqual(result["period"].tolist(), ["2026-01", "2026-02", "2026-03"])
        missing = result[result["period"] == "2026-02"].iloc[0]
        self.assertEqual(missing["covered"], 0)
        self.assertEqual(missing["data_status"], "数据不完整")

    def test_tier_trend_uses_expected_tier_size_as_denominator(self) -> None:
        result = build_tier_trend(self.frame, {"一线": 2, "二线": 1})
        first_tier = result[
            (result["city_tier"] == "一线") & (result["period"] == "2026-01")
        ].iloc[0]

        self.assertEqual(first_tier["up_pct"], 50)
        self.assertEqual(first_tier["down_pct"], 50)
        self.assertEqual(first_tier["data_status"], "数据完整")

    def test_tier_trend_marks_partial_coverage(self) -> None:
        partial = self.frame[~((self.frame["period"] == "2026-03") & (self.frame["city"] == "上海"))]
        result = build_tier_trend(partial, {"一线": 2, "二线": 1})
        first_tier = result[
            (result["city_tier"] == "一线") & (result["period"] == "2026-03")
        ].iloc[0]

        self.assertEqual(first_tier["covered"], 1)
        self.assertEqual(first_tier["up_pct"], 50)
        self.assertEqual(first_tier["data_status"], "数据不完整")


if __name__ == "__main__":
    unittest.main()
