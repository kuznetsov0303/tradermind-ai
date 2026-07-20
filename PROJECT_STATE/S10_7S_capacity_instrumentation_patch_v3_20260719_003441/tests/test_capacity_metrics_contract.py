from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path

def load_module(path):
    spec=importlib.util.spec_from_file_location("capacity_metrics_probe_tested",path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=module
    spec.loader.exec_module(module)
    return module

def run_contract_test(probe_path):
    module=load_module(probe_path)
    now=2_000_000_000.0

    snapshot={
        "symbols":{
            "AAPL":{"eventAgeSeconds":1.0},
            "MSFT":{"receiveAgeSeconds":3.0},
            "NVDA":{"lastEventAt":now-5.0},
            "TSLA":{"lastReceiveAt":(now-7.0)*1000.0},
        }
    }

    ages=module.collect_quote_ages(snapshot,now_epoch=now)
    assert sorted(round(x,6) for x in ages)==[1.0,3.0,5.0,7.0]
    assert module.percentile95(ages)==6.7

    with tempfile.TemporaryDirectory() as raw:
        root=Path(raw)
        market=root/"market.json"
        setup=root/"setup.json"

        market.write_text(json.dumps(snapshot),encoding="utf-8")
        setup.write_text(json.dumps({"setupCycleMs":12.5}),encoding="utf-8")

        module.read_main_pid=lambda _service:123
        module.read_rss_bytes=lambda _pid:104857600
        module.count_provider_errors=lambda _service,_since:2

        metrics=module.collect_capacity_metrics(
            market_state_path=str(market),
            setup_metric_path=str(setup),
            market_service="fake.service",
            since="2026-07-19T00:00:00Z",
        )

        assert metrics["quoteFreshnessP95Seconds"] is not None
        assert metrics["rssBytes"]==104857600
        assert metrics["providerErrorCount"]==2
        assert metrics["setupCycleMs"]==12.5

    return {
        "quoteFreshnessP95Seconds":metrics["quoteFreshnessP95Seconds"],
        "rssBytes":metrics["rssBytes"],
        "providerErrorCount":metrics["providerErrorCount"],
        "setupCycleMs":metrics["setupCycleMs"],
    }
