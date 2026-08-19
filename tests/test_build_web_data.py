import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scripts.build_web_data import build_web_data, dataset_id


class BuildWebDataTests(unittest.TestCase):
    def sample_frame(self) -> pd.DataFrame:
        rows = []
        for period, values in [("2026-06", (99.7, 100.1)), ("2026-07", (99.6, 100.0))]:
            for city, value in zip(("北京", "上海"), values, strict=True):
                rows.append(
                    {
                        "period": period,
                        "house_type": "二手住宅",
                        "size_band": "全部",
                        "metric": "环比",
                        "city": city,
                        "value": value,
                        "source_url": f"https://example.test/{period}",
                        "title": f"{period} 测试数据",
                    }
                )
        return pd.DataFrame(rows)

    def test_builds_aligned_matrix_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            output_dir = Path(temporary_dir)
            manifest = build_web_data(self.sample_frame(), output_dir)
            current_id = dataset_id("二手住宅", "全部", "环比")
            shard = json.loads((output_dir / "shards" / f"{current_id}.json").read_text())

            self.assertEqual(manifest["recordCount"], 4)
            self.assertEqual(manifest["defaultDataset"], current_id)
            descriptor = manifest["datasets"][0]
            self.assertEqual(descriptor["periodCoverage"], [2, 2])
            self.assertEqual(descriptor["coverage"]["completeMonths"], 0)
            self.assertEqual(descriptor["coverage"]["partialMonths"], 2)
            self.assertEqual(descriptor["coverage"]["unpublishedMonths"], 0)
            self.assertIsNone(descriptor["coverage"]["lastCompletePeriod"])
            self.assertEqual(shard["periods"], ["2026-06", "2026-07"])
            self.assertEqual(shard["recordCount"], 4)
            self.assertEqual(len(shard["values"]), 2)
            self.assertEqual(len(shard["values"][0]), 70)
            self.assertEqual(shard["values"][1][:2], [99.6, 100.0])

    def test_rejects_duplicate_observations(self) -> None:
        frame = self.sample_frame()
        frame = pd.concat([frame, frame.iloc[[0]]], ignore_index=True)

        with tempfile.TemporaryDirectory() as temporary_dir:
            with self.assertRaisesRegex(ValueError, "静态数据键重复"):
                build_web_data(frame, Path(temporary_dir))

    def test_committed_static_data_matches_source(self) -> None:
        source = pd.read_csv("data/house_price_index_all.csv.gz")
        data_dir = Path("web/public/data")
        manifest = json.loads((data_dir / "manifest.json").read_text())

        self.assertEqual(manifest["recordCount"], len(source))
        self.assertEqual(manifest["schemaVersion"], 2)
        self.assertTrue(manifest["generatedAt"])
        self.assertEqual(manifest["periodRange"], [source["period"].min(), source["period"].max()])
        self.assertEqual(len(manifest["cities"]), 70)
        self.assertEqual(len(manifest["datasets"]), 24)

        emitted_records = 0
        for descriptor in manifest["datasets"]:
            shard = json.loads((data_dir / descriptor["path"]).read_text())
            self.assertEqual(shard["periods"], descriptor["periods"])
            self.assertEqual(len(descriptor["periodCoverage"]), len(descriptor["periods"]))
            self.assertEqual(len(shard["periods"]), len(shard["values"]))
            self.assertTrue(all(len(row) == 70 for row in shard["values"]))
            non_null = sum(value is not None for row in shard["values"] for value in row)
            self.assertEqual(non_null, descriptor["recordCount"])
            self.assertEqual(non_null, shard["recordCount"])
            emitted_records += non_null

        self.assertEqual(emitted_records, len(source))


if __name__ == "__main__":
    unittest.main()
