from __future__ import annotations

import json
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path


CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

EXTRA=[
    f"T{i:03d}"
    for i in range(26,251)
]

UNIVERSE=CORE25+EXTRA


@dataclass
class FakeSystem:
    root:Path
    current_symbols:list[str]
    original_dropin:str|None
    restarts:int=0
    daemon_reloads:int=0

    def set_symbols(self,symbols:list[str]):
        self.current_symbols=list(symbols)
        dropin=self.root/"etc"/"systemd"/"system"/"skilledge-market-stream.service.d"/"90-s10-7y-capacity-canary.conf"
        dropin.parent.mkdir(parents=True,exist_ok=True)
        dropin.write_text(
            '[Service]\nEnvironment="SKILLEDGE_MARKET_STREAM_SYMBOLS='+
            ",".join(symbols)+'"\n',
            encoding="utf-8",
        )
        self.daemon_reloads+=1
        self.restarts+=1

    def restore_original_symbol_control(self,backup:Path)->bool:
        try:
            self.set_symbols(CORE25)
            dropin=self.root/"etc"/"systemd"/"system"/"skilledge-market-stream.service.d"/"90-s10-7y-capacity-canary.conf"
            backup_dropin=backup/"systemd"/dropin.name

            if backup_dropin.exists():
                dropin.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(backup_dropin,dropin)
            elif dropin.exists():
                dropin.unlink()

            self.daemon_reloads+=1
            self.restarts+=1
            self.current_symbols=list(CORE25)
            return True
        except Exception:
            return False


def build_metrics(stage:int)->dict:
    factor=stage/25.0

    return {
        "rawRecordsPerSecond":1000.0*factor,
        "marketEventsPerSecond":500.0*factor,
        "processingLagP95Ms":10.0,
        "quoteFreshnessP95Seconds":1.0,
        "cpuPercent":20.0+stage/20.0,
        "rssBytes":100_000_000+stage*100_000,
        "snapshotWriteLatencyMs":5.0,
        "candleCompletenessPercent":100.0,
        "providerReconnectCount":0.0,
        "providerErrorCount":0.0,
        "scannerCycleMs":10.0,
        "setupCycleMs":12.0,
        "negativeQuoteAgeCount":0,
        "serviceHealthy":True,
    }


def compare_guard(stage:int,metrics:dict,baseline:dict|None)->list[str]:
    failures=[]

    required=[
        "rawRecordsPerSecond",
        "marketEventsPerSecond",
        "processingLagP95Ms",
        "quoteFreshnessP95Seconds",
        "cpuPercent",
        "rssBytes",
        "snapshotWriteLatencyMs",
        "candleCompletenessPercent",
        "providerReconnectCount",
        "providerErrorCount",
        "scannerCycleMs",
        "setupCycleMs",
    ]

    for key in required:
        if metrics.get(key) is None:
            failures.append(f"MISSING_{key}")

    if not metrics.get("serviceHealthy"):
        failures.append("SERVICE_UNHEALTHY")

    if metrics.get("negativeQuoteAgeCount",0)>0:
        failures.append("NEGATIVE_QUOTE_AGE")

    if metrics.get("rawRecordsPerSecond",0)<=0:
        failures.append("NO_RAW_EVENT_FLOW")

    if metrics.get("marketEventsPerSecond",0)<=0:
        failures.append("NO_MARKET_EVENT_FLOW")

    if metrics.get("cpuPercent",0)>85:
        failures.append("CPU_CEILING_EXCEEDED")

    if metrics.get("candleCompletenessPercent",0)<99:
        failures.append("CANDLE_COMPLETENESS_BELOW_FLOOR")

    if stage==25 or baseline is None:
        return failures

    if metrics["processingLagP95Ms"]>baseline["processingLagP95Ms"]*1.5:
        failures.append("PROCESSING_LAG_REGRESSION")

    if metrics["quoteFreshnessP95Seconds"]>baseline["quoteFreshnessP95Seconds"]*1.5:
        failures.append("QUOTE_FRESHNESS_REGRESSION")

    if metrics["rssBytes"]>baseline["rssBytes"]*1.5:
        failures.append("RSS_GROWTH_REGRESSION")

    if metrics["providerReconnectCount"]>baseline["providerReconnectCount"]:
        failures.append("PROVIDER_RECONNECT_INCREASE")

    if metrics["providerErrorCount"]>baseline["providerErrorCount"]:
        failures.append("PROVIDER_ERROR_INCREASE")

    return failures


def run_scenario(name:str,fail_stage:int|None=None,restore_existing_dropin:bool=False)->dict:
    with tempfile.TemporaryDirectory(prefix="s10_7z_") as raw:
        root=Path(raw)
        dropin=root/"etc"/"systemd"/"system"/"skilledge-market-stream.service.d"/"90-s10-7y-capacity-canary.conf"

        if restore_existing_dropin:
            dropin.parent.mkdir(parents=True,exist_ok=True)
            dropin.write_text(
                '[Service]\nEnvironment="SKILLEDGE_MARKET_STREAM_SYMBOLS='+
                ",".join(CORE25)+'"\n',
                encoding="utf-8",
            )

        backup=root/"backup"
        backup.mkdir(parents=True,exist_ok=True)

        if dropin.exists():
            backup_dropin=backup/"systemd"/dropin.name
            backup_dropin.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(dropin,backup_dropin)

        system=FakeSystem(
            root=root,
            current_symbols=list(CORE25),
            original_dropin=dropin.read_text(encoding="utf-8") if dropin.exists() else None,
        )

        baseline=None
        stages=[]
        rollback=False

        for stage in [25,50,100,150,250]:
            system.set_symbols(UNIVERSE[:stage])
            metrics=build_metrics(stage)

            if fail_stage==stage:
                metrics["processingLagP95Ms"]=100.0

            failures=compare_guard(stage,metrics,baseline)
            stages.append({
                "stage":stage,
                "passed":not failures,
                "failures":failures,
            })

            if failures:
                rollback=True
                restored=system.restore_original_symbol_control(backup)
                break

            if stage==25:
                baseline=metrics
        else:
            restored=system.restore_original_symbol_control(backup)

        final_dropin=dropin.read_text(encoding="utf-8") if dropin.exists() else None

        return {
            "name":name,
            "stages":stages,
            "rollbackPerformed":rollback,
            "restored":restored,
            "finalSymbols":system.current_symbols,
            "finalDropin":final_dropin,
            "originalDropin":system.original_dropin,
            "dropinRestoredExactly":final_dropin==system.original_dropin,
            "core25Restored":system.current_symbols==CORE25,
            "restarts":system.restarts,
            "daemonReloads":system.daemon_reloads,
            "paperRunOnceExecuted":False,
            "paperServiceStarted":False,
            "paperBoundaryReset":False,
            "clientEligibilityChanged":False,
            "telegramEligibilityChanged":False,
            "paperEligibilityChanged":False,
            "brokerEnabled":False,
            "realMoneyEnabled":False,
        }


def main():
    scenarios=[
        run_scenario("all_pass_no_existing_dropin"),
        run_scenario("fail_at_100_no_existing_dropin",fail_stage=100),
        run_scenario("all_pass_existing_dropin",restore_existing_dropin=True),
        run_scenario("fail_at_150_existing_dropin",fail_stage=150,restore_existing_dropin=True),
    ]

    errors=[]

    for scenario in scenarios:
        if not scenario["restored"]:
            errors.append(f'{scenario["name"]}:RESTORE_FALSE')

        if not scenario["core25Restored"]:
            errors.append(f'{scenario["name"]}:CORE25_NOT_RESTORED')

        if not scenario["dropinRestoredExactly"]:
            errors.append(f'{scenario["name"]}:DROPIN_NOT_RESTORED_EXACTLY')

        for key in (
            "paperRunOnceExecuted",
            "paperServiceStarted",
            "paperBoundaryReset",
            "clientEligibilityChanged",
            "telegramEligibilityChanged",
            "paperEligibilityChanged",
            "brokerEnabled",
            "realMoneyEnabled",
        ):
            if scenario[key] is not False:
                errors.append(f'{scenario["name"]}:{key}_NOT_FALSE')

    fail100=next(item for item in scenarios if item["name"]=="fail_at_100_no_existing_dropin")
    fail150=next(item for item in scenarios if item["name"]=="fail_at_150_existing_dropin")

    if not fail100["rollbackPerformed"]:
        errors.append("FAIL100_ROLLBACK_NOT_PERFORMED")

    if not fail150["rollbackPerformed"]:
        errors.append("FAIL150_ROLLBACK_NOT_PERFORMED")

    success=next(item for item in scenarios if item["name"]=="all_pass_no_existing_dropin")

    if len(success["stages"])!=5:
        errors.append("SUCCESS_STAGE_COUNT_NOT_5")

    if [item["stage"] for item in success["stages"]] != [25,50,100,150,250]:
        errors.append("SUCCESS_STAGE_ORDER_INVALID")

    result={
        "ok":not errors,
        "classification":(
            "DAY7D_OFFLINE_CANARY_EXECUTOR_VALIDATION_PASSED"
            if not errors
            else "DAY7D_OFFLINE_CANARY_EXECUTOR_VALIDATION_BLOCKED"
        ),
        "inspectionOnly":True,
        "executorExecutedAgainstVps":False,
        "productionMutation":False,
        "serviceRestarted":False,
        "systemdTouched":False,
        "streamSymbolsChanged":False,
        "packageExecuted":False,
        "deploymentAuthorized":False,
        "armAllowed":False,
        "scenarios":scenarios,
        "errors":errors,
        "warnings":[],
        "nextAction":(
            "MONDAY_RUN_S10_7Y_DURING_US_REGULAR_SESSION"
            if not errors
            else "FIX_OFFLINE_EXECUTOR_VALIDATION"
        ),
    }

    print(json.dumps(result,ensure_ascii=False))


if __name__=="__main__":
    main()