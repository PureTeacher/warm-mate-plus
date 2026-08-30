import unittest

from safety import assess_risk, build_crisis_reply


class SafetyTest(unittest.TestCase):
    def test_normal_pressure_is_not_crisis(self):
        self.assertEqual(assess_risk("最近考试很多，感觉压力很大")["level"], "normal")

    def test_passive_death_wish_is_high(self):
        self.assertEqual(assess_risk("我真的不想活了")["level"], "high")

    def test_imminent_or_ongoing_harm_is_urgent(self):
        self.assertEqual(assess_risk("我已经吞药了，现在很难受")["level"], "urgent")
        self.assertEqual(assess_risk("我准备今晚跳楼")["level"], "urgent")

    def test_negated_mention_is_not_crisis(self):
        self.assertEqual(assess_risk("我没有自杀想法，只是最近有点累")["level"], "normal")

    def test_crisis_reply_uses_verified_general_emergency_paths(self):
        reply = build_crisis_reply("urgent")
        self.assertRegex(reply, r"110|120")
        self.assertIn("可信任", reply)
        self.assertIn("远离", reply)
        self.assertNotIn("400-161-9995", reply)
        self.assertNotIn("我会一直在这里", reply)


if __name__ == "__main__":
    unittest.main()
