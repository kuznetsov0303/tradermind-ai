import unittest
from decimal import Decimal

from app.market_data.quote_quality import QuoteQuality, assess_quote


class QuoteQualityTests(unittest.TestCase):
    def test_valid_quote(self):
        result = assess_quote(
            bid=Decimal("100"),
            ask=Decimal("100.05"),
            age_seconds=1,
        )
        self.assertEqual(result.quality, QuoteQuality.VALID)
        self.assertTrue(result.usable_for_trading)

    def test_locked_quote(self):
        result = assess_quote(
            bid=Decimal("100"),
            ask=Decimal("100"),
            age_seconds=1,
        )
        self.assertEqual(result.quality, QuoteQuality.LOCKED)
        self.assertFalse(result.usable_for_trading)

    def test_crossed_quote(self):
        result = assess_quote(
            bid=Decimal("101"),
            ask=Decimal("100"),
            age_seconds=1,
        )
        self.assertEqual(result.quality, QuoteQuality.CROSSED)

    def test_wide_quote(self):
        result = assess_quote(
            bid=Decimal("100"),
            ask=Decimal("102"),
            age_seconds=1,
        )
        self.assertEqual(result.quality, QuoteQuality.WIDE)

    def test_stale_quote(self):
        result = assess_quote(
            bid=Decimal("100"),
            ask=Decimal("100.05"),
            age_seconds=30,
        )
        self.assertEqual(result.quality, QuoteQuality.STALE)


if __name__ == "__main__":
    unittest.main()