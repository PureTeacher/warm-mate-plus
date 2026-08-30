import json
import pathlib
import unittest

from safety import assess_risk


CASES = json.loads((pathlib.Path(__file__).parents[1] / "tests" / "safety_cases.json").read_text(encoding="utf-8"))


class SafetyBenchmarkTest(unittest.TestCase):
    def test_backend_matches_all_60_expected_levels(self):
        self.assertEqual(len(CASES), 60)
        errors = []
        for item in CASES:
            actual = assess_risk(item["text"])["level"]
            if actual != item["expected"]:
                errors.append({"id": item["id"], "expected": item["expected"], "actual": actual})
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
