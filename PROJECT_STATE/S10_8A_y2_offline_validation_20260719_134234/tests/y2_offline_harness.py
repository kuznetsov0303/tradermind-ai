from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

CORE25=[
    "AAPL","MSFT","NVDA","TSLA","AMD","AMZN","META","GOOGL","AVGO",
    "PLTR","SMCI","MSTR","COIN","NFLX","CRM","ORCL","INTC","MU","ARM",
    "UBER","SHOP","RIVN","SOFI","CRWD","NOW",
]

EXTRA=[f"T{i:03d}" for i in range(26,251)]
UNIVERSE=CORE25+EXTRA

PAYLOAD_RELATIVE=[
    Path("app/market_data/security_master.py"),
    Path("app/market_data/stream_service.py"),
    Path("app/discovery.py"),
    Path("ops/scripts/capacity_metrics_probe.py"),
]

def write(path:Path,text:str):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text,encoding="utf-8")

def build_environment(root:Path,existing_dropin:bool):
    production=root/"production"
    backup=root/"backup"
    bundle=root/"bundle"

    for relative in PAYLOAD_RELATIVE:
        write(bundle/relative,"NEW:"+str(relative))

    existing_before={
        Path("app/market_data/stream_service.py"):"OLD_STREAM",
        Path("app/discovery.py"):"OLD_DISCOVERY",
    }

    for relative,content in existing_before.items():
        write(production/relative,content)

    dropin=production/"etc/systemd/system/skilledge-market-stream.service.d/90-s10-7y-capacity-canary.conf"

    if existing_dropin:
        write(
            dropin,
            '[Service]\nEnvironment="SKILLEDGE_MARKET_STREAM_SYMBOLS='+
            ",".join(CORE25)+'"\n',
        )

    return production,backup,bundle,dropin,existing_before

def deploy_payload(production:Path,bundle:Path,backup:Path):
    manifest=[]

    for relative in PAYLOAD_RELATIVE:
        source=bundle/relative
        target=production/relative
        existed=target.exists()

        manifest.append({
            "relative":str(relative).replace("\\","/"),
            "existedBefore":existed,
        })

        if existed:
            backup_target=backup/relative
            backup_target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(target,backup_target)

        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)

    write(
        backup/"payload_restore_manifest.json",
        json.dumps(manifest,indent=2),
    )

def restore_payload(production:Path,backup:Path)->bool:
    manifest_path=backup/"payload_restore_manifest.json"

    if not manifest_path.is_file():
        return False

    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))

    for item in manifest:
        relative=Path(item["relative"])
        target=production/relative
        source=backup/relative

        if item["existedBefore"]:
            if not source.is_file():
                return False
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
        elif target.exists():
            target.unlink()

    return True

def set_symbols(dropin:Path,symbols:list[str]):
    write(
        dropin,
        '[Service]\nEnvironment="SKILLEDGE_MARKET_STREAM_SYMBOLS='+
        ",".join(symbols)+'"\n',
    )

def restore_original_symbol_control(
    dropin:Path,
    backup:Path,
    original_dropin:str|None,
)->bool:
    try:
        set_symbols(dropin,CORE25)
        backup_dropin=backup/"systemd"/dropin.name

        if backup_dropin.exists():
            dropin.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(backup_dropin,dropin)
        elif dropin.exists():
            dropin.unlink()

        final=dropin.read_text(encoding="utf-8") if dropin.exists() else None
        return final==original_dropin
    except Exception:
        return False

def run_scenario(
    name:str,
    *,
    existing_dropin:bool,
    fail_stage:int|None,
):
    with tempfile.TemporaryDirectory(prefix="s10_8a_") as raw:
        root=Path(raw)
        production,backup,bundle,dropin,existing_before=build_environment(
            root,
            existing_dropin,
        )

        original_dropin=dropin.read_text(encoding="utf-8") if dropin.exists() else None

        if dropin.exists():
            backup_dropin=backup/"systemd"/dropin.name
            backup_dropin.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(dropin,backup_dropin)

        deploy_payload(production,bundle,backup)

        stages=[]
        rollback=False

        for stage in [25,50,100,150,250]:
            set_symbols(dropin,UNIVERSE[:stage])
            passed=(stage!=fail_stage)
            stages.append({
                "stage":stage,
                "passed":passed,
            })

            if not passed:
                rollback=True
                break

        core25_restored=restore_original_symbol_control(
            dropin,
            backup,
            original_dropin,
        )
        payload_restored=restore_payload(production,backup)

        existing_files_exact=all(
            (production/relative).read_text(encoding="utf-8")==content
            for relative,content in existing_before.items()
        )

        new_files_removed=all(
            not (production/relative).exists()
            for relative in PAYLOAD_RELATIVE
            if relative not in existing_before
        )

        final_dropin=dropin.read_text(encoding="utf-8") if dropin.exists() else None

        return {
            "name":name,
            "stages":stages,
            "rollbackPerformed":rollback,
            "core25Restored":core25_restored,
            "payloadRestored":payload_restored,
            "existingFilesRestoredExactly":existing_files_exact,
            "newFilesRemoved":new_files_removed,
            "dropinRestoredExactly":final_dropin==original_dropin,
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
        run_scenario(
            "all_pass_no_existing_dropin",
            existing_dropin=False,
            fail_stage=None,
        ),
        run_scenario(
            "fail_100_no_existing_dropin",
            existing_dropin=False,
            fail_stage=100,
        ),
        run_scenario(
            "all_pass_existing_dropin",
            existing_dropin=True,
            fail_stage=None,
        ),
        run_scenario(
            "fail_150_existing_dropin",
            existing_dropin=True,
            fail_stage=150,
        ),
    ]

    errors=[]

    for scenario in scenarios:
        for key in (
            "core25Restored",
            "payloadRestored",
            "existingFilesRestoredExactly",
            "newFilesRemoved",
            "dropinRestoredExactly",
        ):
            if scenario[key] is not True:
                errors.append(f'{scenario["name"]}:{key}_FAILED')

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

    success=next(item for item in scenarios if item["name"]=="all_pass_no_existing_dropin")
    stage_order=[item["stage"] for item in success["stages"]]

    if stage_order != [25,50,100,150,250]:
        errors.append("STAGE_ORDER_INVALID")

    if not next(item for item in scenarios if item["name"]=="fail_100_no_existing_dropin")["rollbackPerformed"]:
        errors.append("FAIL100_ROLLBACK_NOT_PERFORMED")

    if not next(item for item in scenarios if item["name"]=="fail_150_existing_dropin")["rollbackPerformed"]:
        errors.append("FAIL150_ROLLBACK_NOT_PERFORMED")

    result={
        "ok":not errors,
        "classification":(
            "DAY7D_Y2_OFFLINE_EXECUTOR_VALIDATION_PASSED"
            if not errors
            else "DAY7D_Y2_OFFLINE_EXECUTOR_VALIDATION_BLOCKED"
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
        "expectedStageOrder":[25,50,100,150,250],
        "actualStageOrder":stage_order,
        "scenarios":scenarios,
        "errors":errors,
        "warnings":[],
        "nextAction":(
            "MONDAY_RUN_S10_7Y2_DURING_US_REGULAR_SESSION"
            if not errors
            else "FIX_Y2_OFFLINE_VALIDATION"
        ),
    }

    print(json.dumps(result,ensure_ascii=False))

if __name__=="__main__":
    main()