import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.check_monthly_update import (
    expected_keys,
    inspect_data_file,
    period_label,
    previous_month,
    validate_period_records,
)
from scripts.fetch_stats import write_csv


class CheckMonthlyUpdateTests(unittest.TestCase):
    def records_for_period(self, period: str) -> list[dict[str, str]]:
        records = []
        for table_no, house_type, size_band, city, metric in sorted(expected_keys(period)):
            records.append(
                {
                    "period": period,
                    "table_no": table_no,
                    "table_name": f"{period} 测试表",
                    "house_type": house_type,
                    "size_band": size_band,
                    "city": city,
                    "metric": metric,
                    "base": "上月=100",
                    "value": "99.8",
                    "change_pct": "-0.2",
                    "source_url": "https://www.stats.gov.cn/sj/zxfb/test.html",
                    "title": f"{period} 70个大中城市住宅销售价格变动情况",
                }
            )
        return records

    def test_previous_month_handles_year_boundary(self) -> None:
        self.assertEqual(previous_month(date(2026, 1, 8)), "2025-12")
        self.assertEqual(previous_month(date(2026, 8, 8)), "2026-07")
        self.assertEqual(period_label("2026-07"), "2026年7月")

    def test_accepts_complete_regular_and_january_periods(self) -> None:
        regular = self.records_for_period("2026-07")
        january = self.records_for_period("2026-01")

        self.assertEqual(len(regular), 1680)
        self.assertEqual(len(january), 1120)
        self.assertEqual(validate_period_records(regular, "2026-07"), [])
        self.assertEqual(validate_period_records(january, "2026-01"), [])

    def test_rejects_missing_and_duplicate_dimensions(self) -> None:
        records = self.records_for_period("2026-07")
        records[-1] = records[0].copy()

        problems = validate_period_records(records, "2026-07")

        self.assertTrue(any("重复维度" in problem for problem in problems))
        self.assertTrue(any("缺少" in problem for problem in problems))

    def test_inspects_target_period_and_final_check_state(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            data_path = Path(temporary_dir) / "data.csv.gz"
            records = self.records_for_period("2026-06") + self.records_for_period("2026-07")
            write_csv(records, data_path)

            status = inspect_data_file(data_path, "2026-07", reference_date=date(2026, 8, 21))

        self.assertTrue(status.complete)
        self.assertTrue(status.final_check)
        self.assertEqual(status.latest_period, "2026-07")
        self.assertEqual(status.record_count, 1680)


if __name__ == "__main__":
    unittest.main()
