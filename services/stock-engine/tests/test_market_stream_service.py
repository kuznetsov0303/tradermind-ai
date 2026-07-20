import unittest
from datetime import datetime,timezone
from decimal import Decimal
from app.market_data.contracts import BboPayload,EventType,MarketEvent,ProviderName
class StreamServiceTest(unittest.TestCase):
    def test_contract_for_service(self):
        now=datetime.now(timezone.utc)
        e=MarketEvent(provider=ProviderName.DATABENTO,dataset="EQUS.MINI",event_type=EventType.BBO,
          symbol="AAPL",instrument_id=38,event_time=now,receive_time=now,
          payload=BboPayload(Decimal("100"),Decimal("100.1"),10,20))
        self.assertEqual(e.payload.spread,Decimal("0.1"))
if __name__=="__main__":unittest.main()