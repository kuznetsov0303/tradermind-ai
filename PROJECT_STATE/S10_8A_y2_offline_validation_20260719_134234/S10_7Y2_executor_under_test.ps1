param(
  [string]$ProjectRoot=(Get-Location).Path,
  [string]$VpsHost="178.104.184.138",
  [string]$VpsUser="root",
  [string]$SshKey="$env:USERPROFILE\.ssh\skilledge_hetzner",
  [switch]$Execute
)

$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest

if(-not $Execute){
  throw "Execution switch missing. Re-run with -Execute after confirming US regular session is open."
}

$ProjectRoot=(Resolve-Path -LiteralPath $ProjectRoot).Path
$State=Join-Path $ProjectRoot "PROJECT_STATE"
$Audit=Join-Path $ProjectRoot "audit_exports"
$Milestones=Join-Path $State "milestones"

New-Item -ItemType Directory -Force -Path $Audit,$Milestones|Out-Null

if(-not (Test-Path -LiteralPath $SshKey)){
  throw "SSH key not found: $SshKey"
}

$finalReview=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7W_FINAL_CANARY_PACKAGE_REVIEW_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$preflight=Get-ChildItem -LiteralPath $Audit -File -Filter "S10_7X2_CANARY_EXECUTION_PREFLIGHT_raw_*.json" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

$package=Get-ChildItem -LiteralPath $State -Directory -Filter "S10_7V_guarded_v2_canary_with_v3_*" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $finalReview){throw "Final S10.7W review not found"}
if(-not $preflight){throw "S10.7X2 preflight not found"}
if(-not $package){throw "S10.7V canary package not found"}

$finalReviewPayload=Get-Content -LiteralPath $finalReview.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$preflightPayload=Get-Content -LiteralPath $preflight.FullName -Raw -Encoding UTF8 | ConvertFrom-Json

if($finalReviewPayload.ok -ne $true){
  throw "Final S10.7W review is not OK"
}

if($preflightPayload.ok -ne $true){
  throw "S10.7X2 preflight is not OK"
}

$universeFile=Join-Path $package.FullName "config\validated_liquid_250_universe.json"
$planFile=Join-Path $package.FullName "config\canary_plan.json"
$v3Root=Join-Path $package.FullName "patch\capacity_instrumentation_v3"

$securityMaster=Join-Path $v3Root "base_v2\app\market_data\security_master.py"
$streamService=Join-Path $v3Root "base_v2\app\market_data\stream_service.py"
$discovery=Join-Path $v3Root "patch\app\discovery.py"
$capacityProbe=Join-Path $v3Root "patch\ops\scripts\capacity_metrics_probe.py"

foreach($path in @(
  $universeFile,
  $planFile,
  $securityMaster,
  $streamService,
  $discovery,
  $capacityProbe
)){
  if(-not (Test-Path -LiteralPath $path)){
    throw "Required executor payload missing: $path"
  }
}

$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$workLocal=Join-Path $env:TEMP "s10_7y_$stamp"
$bundleLocal=Join-Path $workLocal "bundle"
$remoteRoot="/tmp/s10_7y_$stamp"
$remoteBundle="$remoteRoot/bundle"
$remoteRunner="$remoteRoot/run_canary.py"
$remoteResult="$remoteRoot/result.json"

$rawLocal=Join-Path $Audit "S10_7Y_GUARDED_CAPACITY_CANARY_raw_$stamp.json"
$reportLocal=Join-Path $Audit "S10_7Y_GUARDED_CAPACITY_CANARY_report_$stamp.txt"
$milestoneLocal=Join-Path $Milestones "S10_7Y_GUARDED_CAPACITY_CANARY_$stamp.md"

New-Item -ItemType Directory -Force -Path $bundleLocal|Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleLocal "app\market_data")|Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleLocal "app")|Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleLocal "ops\scripts")|Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $bundleLocal "config")|Out-Null

Copy-Item -LiteralPath $securityMaster -Destination (Join-Path $bundleLocal "app\market_data\security_master.py") -Force
Copy-Item -LiteralPath $streamService -Destination (Join-Path $bundleLocal "app\market_data\stream_service.py") -Force
Copy-Item -LiteralPath $discovery -Destination (Join-Path $bundleLocal "app\discovery.py") -Force
Copy-Item -LiteralPath $capacityProbe -Destination (Join-Path $bundleLocal "ops\scripts\capacity_metrics_probe.py") -Force
Copy-Item -LiteralPath $universeFile -Destination (Join-Path $bundleLocal "config\validated_liquid_250_universe.json") -Force
Copy-Item -LiteralPath $planFile -Destination (Join-Path $bundleLocal "config\canary_plan.json") -Force

$runner=@'
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import statistics
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT=Path("/opt/skilledge/stock-engine")
SERVICE="skilledge-market-stream.service"
API_SERVICE="skilledge-stock-engine-api.service"
DROPIN_DIR=Path("/etc/systemd/system/skilledge-market-stream.service.d")
DROPIN=DROPIN_DIR/"90-s10-7y-capacity-canary.conf"
DATA=ROOT/"data"
STATUS=DATA/"market_stream_status.json"
MARKET=DATA/"market_state_snapshot.json"
SCANNER=DATA/"scanner_snapshot.json"
SETUP_METRIC=DATA/"runtime"/"setup_cycle_metric.json"

ALIASES={
    "rawRecordsPerSecond":["rawRecordsPerSecond"],
    "marketEventsPerSecond":["marketEventsPerSecond"],
    "processingLagP95Ms":["processingLagP95Ms","callbackLatencyMs"],
    "cpuPercent":["cpuPercent"],
    "snapshotWriteLatencyMs":["snapshotWriteLatencyMs"],
    "candleCompletenessPercent":["candleCompletenessPercent","candleCompleteness"],
    "providerReconnectCount":["providerReconnectCount","reconnectCount"],
    "scannerCycleMs":["scannerCycleMs","scannerBuildLatencyMs"],
}

def run(args,check=False):
    result=subprocess.run(
        args,
        capture_output=True,
        text=True,
        check=False,
    )
    if check and result.returncode!=0:
        raise RuntimeError(
            f"command failed: {args}\n{result.stdout}\n{result.stderr}"
        )
    return result

def read_json(path):
    try:
        data=json.loads(Path(path).read_text(encoding="utf-8"))
        return data
    except Exception:
        return {}

def recursive_values(node,key):
    values=[]
    if isinstance(node,dict):
        for current,value in node.items():
            if current==key:
                values.append(value)
            values.extend(recursive_values(value,key))
    elif isinstance(node,list):
        for value in node:
            values.extend(recursive_values(value,key))
    return values

def numeric(value):
    try:
        number=float(value)
    except (TypeError,ValueError):
        return None
    return number if math.isfinite(number) else None

def first_metric(documents,aliases):
    for alias in aliases:
        for document in documents:
            for value in recursive_values(document,alias):
                number=numeric(value)
                if number is not None:
                    return number
    return None

def negative_age_count(node):
    count=0
    if isinstance(node,dict):
        for key,value in node.items():
            normalized=str(key).replace("_","").lower()
            if normalized in {
                "eventageseconds",
                "receiveageseconds",
                "quoteageseconds",
                "lastquoteageseconds",
            }:
                number=numeric(value)
                if number is not None and number<0:
                    count+=1
            count+=negative_age_count(value)
    elif isinstance(node,list):
        for value in node:
            count+=negative_age_count(value)
    return count

def service_active(service):
    result=run(["systemctl","is-active",service])
    return result.stdout.strip()=="active"

def health_ok():
    result=run([
        "curl","-fsS","--max-time","10",
        "http://127.0.0.1:8000/health",
    ])
    if result.returncode!=0:
        return False
    try:
        return json.loads(result.stdout).get("ok") is True
    except Exception:
        return False

def set_symbols(symbols):
    DROPIN_DIR.mkdir(parents=True,exist_ok=True)
    line="Environment=\"SKILLEDGE_MARKET_STREAM_SYMBOLS="+",".join(symbols)+"\"\n"
    temp=DROPIN.with_suffix(".tmp")
    temp.write_text("[Service]\n"+line,encoding="utf-8")
    os.replace(temp,DROPIN)
    run(["systemctl","daemon-reload"],check=True)
    run(["systemctl","restart",SERVICE],check=True)

def restore_original_symbol_control(core25,backup):
    try:
        # First force Core25 before removing the temporary override.
        set_symbols(core25)

        backup_dropin=backup/"systemd"/DROPIN.name

        if backup_dropin.exists():
            DROPIN_DIR.mkdir(parents=True,exist_ok=True)
            shutil.copy2(backup_dropin,DROPIN)
        elif DROPIN.exists():
            DROPIN.unlink()

        run(["systemctl","daemon-reload"],check=True)
        run(["systemctl","restart",SERVICE],check=True)
        return True
    except Exception:
        return False

def payload_mappings(bundle=None):
    if bundle is None:
        return [
            ROOT/"app"/"market_data"/"security_master.py",
            ROOT/"app"/"market_data"/"stream_service.py",
            ROOT/"app"/"discovery.py",
            ROOT/"ops"/"scripts"/"capacity_metrics_probe.py",
        ]

    return [
        (bundle/"app"/"market_data"/"security_master.py",ROOT/"app"/"market_data"/"security_master.py"),
        (bundle/"app"/"market_data"/"stream_service.py",ROOT/"app"/"market_data"/"stream_service.py"),
        (bundle/"app"/"discovery.py",ROOT/"app"/"discovery.py"),
        (bundle/"ops"/"scripts"/"capacity_metrics_probe.py",ROOT/"ops"/"scripts"/"capacity_metrics_probe.py"),
    ]

def deploy_payload(bundle,backup):
    manifest=[]

    for source,target in payload_mappings(bundle):
        if not source.is_file():
            raise RuntimeError(f"payload source missing: {source}")

        target.parent.mkdir(parents=True,exist_ok=True)
        relative=target.relative_to(ROOT)
        backup_target=backup/relative
        existed=target.exists()

        manifest.append({
            "relative":str(relative),
            "existedBefore":existed,
        })

        if existed:
            backup_target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(target,backup_target)

        shutil.copy2(source,target)

    (backup/"payload_restore_manifest.json").write_text(
        json.dumps(manifest,ensure_ascii=False,indent=2),
        encoding="utf-8",
    )

    compile_result=run([
        str(ROOT/".venv"/"bin"/"python"),
        "-m","compileall","-q",
        str(ROOT/"app"/"market_data"/"security_master.py"),
        str(ROOT/"app"/"market_data"/"stream_service.py"),
        str(ROOT/"app"/"discovery.py"),
        str(ROOT/"ops"/"scripts"/"capacity_metrics_probe.py"),
    ])
    if compile_result.returncode!=0:
        raise RuntimeError("python compile failed: "+compile_result.stderr)

    run(["systemctl","restart",API_SERVICE],check=True)
    run(["systemctl","restart",SERVICE],check=True)

def restore_payload(backup):
    manifest_path=backup/"payload_restore_manifest.json"

    if not manifest_path.is_file():
        return False

    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))

    for item in manifest:
        target=ROOT/item["relative"]
        source=backup/item["relative"]

        if item["existedBefore"]:
            if not source.is_file():
                return False
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
        elif target.exists():
            target.unlink()

    compile_targets=[
        str(target)
        for target in payload_mappings()
        if target.is_file()
    ]

    if compile_targets:
        compile_result=run([
            str(ROOT/".venv"/"bin"/"python"),
            "-m","compileall","-q",
            *compile_targets,
        ])
        if compile_result.returncode!=0:
            return False

    run(["systemctl","restart",API_SERVICE],check=True)
    run(["systemctl","restart",SERVICE],check=True)
    return True

def run_capacity_probe(stage_started):
    output=DATA/"runtime"/"capacity_probe_result.json"
    result=run([
        str(ROOT/".venv"/"bin"/"python"),
        str(ROOT/"ops"/"scripts"/"capacity_metrics_probe.py"),
        "--market-state-path",str(MARKET),
        "--setup-metric-path",str(SETUP_METRIC),
        "--market-service",SERVICE,
        "--since",stage_started,
        "--output",str(output),
    ])
    payload=read_json(output)
    return payload

def collect_metrics(stage_started):
    status=read_json(STATUS)
    market=read_json(MARKET)
    scanner=read_json(SCANNER)
    probe=run_capacity_probe(stage_started)
    documents=[status,market,scanner]

    metrics={
        name:first_metric(documents,aliases)
        for name,aliases in ALIASES.items()
    }

    probe_metrics=probe.get("metrics") or {}
    metrics.update({
        "quoteFreshnessP95Seconds":numeric(probe_metrics.get("quoteFreshnessP95Seconds")),
        "rssBytes":numeric(probe_metrics.get("rssBytes")),
        "providerErrorCount":numeric(probe_metrics.get("providerErrorCount")),
        "setupCycleMs":numeric(probe_metrics.get("setupCycleMs")),
        "negativeQuoteAgeCount":negative_age_count(market),
        "serviceHealthy":service_active(SERVICE) and service_active(API_SERVICE) and health_ok(),
    })
    return metrics

def compare_guard(stage,metrics,baseline,rules):
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

    if failures:
        return failures

    if not metrics["serviceHealthy"]:
        failures.append("SERVICE_UNHEALTHY")

    if metrics["negativeQuoteAgeCount"]>0:
        failures.append("NEGATIVE_QUOTE_AGE")

    if metrics["rawRecordsPerSecond"]<=0:
        failures.append("NO_RAW_EVENT_FLOW")

    if metrics["marketEventsPerSecond"]<=0:
        failures.append("NO_MARKET_EVENT_FLOW")

    if metrics["cpuPercent"]>float(rules["cpuPercentCeiling"]):
        failures.append("CPU_CEILING_EXCEEDED")

    if metrics["candleCompletenessPercent"]<float(rules["candleCompletenessFloorPercent"]):
        failures.append("CANDLE_COMPLETENESS_BELOW_FLOOR")

    if stage==25 or baseline is None:
        return failures

    def regression(metric,percent):
        base=float(baseline[metric])
        current=float(metrics[metric])
        if base<=0:
            return current>0
        return current>base*(1+float(percent)/100.0)

    checks=[
        ("processingLagP95Ms","processingLagP95RegressionPercent","PROCESSING_LAG_REGRESSION"),
        ("quoteFreshnessP95Seconds","quoteFreshnessP95RegressionPercent","QUOTE_FRESHNESS_REGRESSION"),
        ("rssBytes","rssGrowthPercentCeiling","RSS_GROWTH_REGRESSION"),
        ("snapshotWriteLatencyMs","snapshotWriteRegressionPercent","SNAPSHOT_WRITE_REGRESSION"),
        ("scannerCycleMs","scannerCycleRegressionPercent","SCANNER_CYCLE_REGRESSION"),
        ("setupCycleMs","setupCycleRegressionPercent","SETUP_CYCLE_REGRESSION"),
    ]

    for metric,rule,error in checks:
        if regression(metric,rules[rule]):
            failures.append(error)

    if metrics["providerReconnectCount"]>baseline["providerReconnectCount"]:
        failures.append("PROVIDER_RECONNECT_INCREASE")

    if metrics["providerErrorCount"]>baseline["providerErrorCount"]:
        failures.append("PROVIDER_ERROR_INCREASE")

    return failures

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--bundle",required=True)
    parser.add_argument("--output",required=True)
    args=parser.parse_args()

    bundle=Path(args.bundle)
    output=Path(args.output)
    universe_doc=read_json(bundle/"config"/"validated_liquid_250_universe.json")
    plan=read_json(bundle/"config"/"canary_plan.json")

    universe=universe_doc.get("finalUniverse") or []
    if len(universe)!=250 or len(set(universe))!=250:
        raise RuntimeError("invalid universe")

    core25=universe[:25]
    stages=plan["stages"]
    rules=plan["rollbackRules"]

    now_et=datetime.now(ZoneInfo("America/New_York"))
    minutes=now_et.hour*60+now_et.minute
    enough_time=now_et.weekday()<5 and (9*60+35)<=minutes<14*60+45

    result={
        "ok":False,
        "classification":"DAY7D_GUARDED_CAPACITY_CANARY_BLOCKED",
        "newYorkStartedAt":now_et.isoformat(),
        "marketHoursGatePassed":enough_time,
        "explicitExecutionApprovalRecorded":True,
        "stages":[],
        "rollbackPerformed":False,
        "productionUniverseRestoredTo25":False,
        "productionPayloadRestored":False,
        "clientEligibilityChanged":False,
        "telegramEligibilityChanged":False,
        "paperEligibilityChanged":False,
        "paperRunOnceExecuted":False,
        "paperServiceStarted":False,
        "paperBoundaryReset":False,
        "brokerEnabled":False,
        "realMoneyEnabled":False,
        "errors":[],
    }

    if not enough_time:
        result["errors"].append("MARKET_HOURS_GATE_FAILED")
        output.write_text(json.dumps(result,indent=2),encoding="utf-8")
        return 2

    backup=ROOT/"backups"/("s10_7y_"+datetime.now().strftime("%Y%m%d_%H%M%S"))
    backup.mkdir(parents=True,exist_ok=True)

    if DROPIN.exists():
        backup_dropin=backup/"systemd"/DROPIN.name
        backup_dropin.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(DROPIN,backup_dropin)

    baseline=None
    failure=None

    try:
        deploy_payload(bundle,backup)
        time.sleep(20)

        for stage in stages:
            count=int(stage["stage"])
            duration=int(stage["durationMinutes"])
            symbols=universe[:count]
            stage_started=datetime.now(ZoneInfo("America/New_York")).isoformat()

            set_symbols(symbols)
            time.sleep(20)
            time.sleep(duration*60)

            metrics=collect_metrics(stage_started)
            failures=compare_guard(count,metrics,baseline,rules)

            record={
                "stage":count,
                "durationMinutes":duration,
                "symbolsCount":len(symbols),
                "metrics":metrics,
                "failures":failures,
                "passed":not failures,
            }
            result["stages"].append(record)

            if failures:
                failure={
                    "stage":count,
                    "failures":failures,
                }
                break

            if count==25:
                baseline=metrics

        if failure:
            result["errors"].append("STAGE_FAILED")
            result["failedStage"]=failure
            result["rollbackPerformed"]=True
            restored=restore_original_symbol_control(core25,backup)
            result["productionUniverseRestoredTo25"]=restored
            result["classification"]="DAY7D_GUARDED_CAPACITY_CANARY_ROLLED_BACK"
        else:
            restored=restore_original_symbol_control(core25,backup)
            result["productionUniverseRestoredTo25"]=restored

            if not restored:
                result["errors"].append("FINAL_CORE25_RESTORE_FAILED")
            else:
                result["ok"]=True
            if result["ok"]:
                result["classification"]="DAY7D_GUARDED_CAPACITY_CANARY_COMPLETED_CORE25_RESTORED"
            else:
                result["classification"]="DAY7D_GUARDED_CAPACITY_CANARY_RESTORE_FAILED"

    except Exception as exc:
        result["errors"].append(f"EXECUTION_EXCEPTION:{type(exc).__name__}:{exc}")
        result["rollbackPerformed"]=True
        restored=restore_original_symbol_control(core25,backup)
        result["productionUniverseRestoredTo25"]=restored

    finally:
        payload_restored=restore_payload(backup)
        result["productionPayloadRestored"]=payload_restored

        if not payload_restored:
            result["ok"]=False
            result["errors"].append("PRODUCTION_PAYLOAD_RESTORE_FAILED")
            result["classification"]="DAY7D_GUARDED_CAPACITY_CANARY_PAYLOAD_RESTORE_FAILED"

        result["newYorkFinishedAt"]=datetime.now(ZoneInfo("America/New_York")).isoformat()
        result["packageExecuted"]=True
        result["deploymentAuthorized"]=True
        result["armAllowed"]=True
        result["serviceRestarted"]=True
        result["systemdTouched"]=True
        result["streamSymbolsChanged"]=True
        result["backupRoot"]=str(backup)
        output.write_text(
            json.dumps(result,ensure_ascii=False,indent=2),
            encoding="utf-8",
        )

    return 0 if result["ok"] else 3

if __name__=="__main__":
    raise SystemExit(main())
'@

$runnerLocal=Join-Path $workLocal "run_canary.py"
New-Item -ItemType Directory -Force -Path $workLocal|Out-Null
[IO.File]::WriteAllText($runnerLocal,$runner,[Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "=== S10.7Y GUARDED CAPACITY CANARY EXECUTION ===" -ForegroundColor Green
Write-Host "This performs production market-stream restarts and temporary universe changes." -ForegroundColor Yellow
Write-Host "Automatic rollback target: Core25." -ForegroundColor Yellow

& ssh -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}" `
  "mkdir -p '$remoteRoot'"

if($LASTEXITCODE-ne 0){
  throw "Failed to create remote canary root"
}

& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new -r `
  $bundleLocal "${VpsUser}@${VpsHost}:$remoteRoot/"

if($LASTEXITCODE-ne 0){
  throw "Failed to upload canary bundle"
}

& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  $runnerLocal "${VpsUser}@${VpsHost}:$remoteRunner"

if($LASTEXITCODE-ne 0){
  throw "Failed to upload canary runner"
}

& ssh -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}" `
  "python3 '$remoteRunner' --bundle '$remoteBundle' --output '$remoteResult'"

$remoteExit=$LASTEXITCODE

& scp -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}:$remoteResult" $rawLocal

if($LASTEXITCODE-ne 0){
  throw "Failed to download canary result"
}

& ssh -i $SshKey -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
  "${VpsUser}@${VpsHost}" `
  "rm -rf '$remoteRoot'"

$r=Get-Content -LiteralPath $rawLocal -Raw -Encoding UTF8 | ConvertFrom-Json

$stageLines=@(
  $r.stages |
  ForEach-Object {
    "stage=$($_.stage),passed=$($_.passed),failures=$(@($_.failures)-join '|')"
  }
)

@(
 "S10.7Y GUARDED CAPACITY CANARY",
 "Generated=$stamp",
 "OK=$($r.ok)",
 "CLASSIFICATION=$($r.classification)",
 "MARKET_HOURS_GATE_PASSED=$($r.marketHoursGatePassed)",
 "STAGES=$($stageLines -join ' ; ')",
 "ROLLBACK_PERFORMED=$($r.rollbackPerformed)",
 "CORE25_RESTORED=$($r.productionUniverseRestoredTo25)",
 "PRODUCTION_PAYLOAD_RESTORED=$($r.productionPayloadRestored)",
 "ERRORS=$(@($r.errors)-join ',')",
 "PACKAGE_EXECUTED=$($r.packageExecuted)",
 "DEPLOYMENT_AUTHORIZED=$($r.deploymentAuthorized)",
 "ARM_ALLOWED=$($r.armAllowed)",
 "SERVICE_RESTARTED=$($r.serviceRestarted)",
 "SYSTEMD_TOUCHED=$($r.systemdTouched)",
 "STREAM_SYMBOLS_CHANGED=$($r.streamSymbolsChanged)",
 "CLIENT_ELIGIBILITY_CHANGED=$($r.clientEligibilityChanged)",
 "TELEGRAM_ELIGIBILITY_CHANGED=$($r.telegramEligibilityChanged)",
 "PAPER_ELIGIBILITY_CHANGED=$($r.paperEligibilityChanged)",
 "PAPER_RUN_ONCE_EXECUTED=$($r.paperRunOnceExecuted)",
 "PAPER_SERVICE_STARTED=$($r.paperServiceStarted)",
 "PAPER_BOUNDARY_RESET=$($r.paperBoundaryReset)",
 "BROKER_ENABLED=$($r.brokerEnabled)",
 "REAL_MONEY_ENABLED=$($r.realMoneyEnabled)",
 "BACKUP_ROOT=$($r.backupRoot)",
 "RAW_JSON=$rawLocal"
) | Set-Content -LiteralPath $reportLocal -Encoding UTF8

@"
# S10.7Y Guarded Capacity Canary

- OK: $($r.ok)
- Classification: $($r.classification)
- Market-hours gate passed: $($r.marketHoursGatePassed)
- Stages: $($stageLines -join ' ; ')
- Rollback performed: $($r.rollbackPerformed)
- Core25 restored: $($r.productionUniverseRestoredTo25)
- Production payload restored: $($r.productionPayloadRestored)
- Errors: $(@($r.errors)-join ', ')
- Package executed: $($r.packageExecuted)
- Service restarted: $($r.serviceRestarted)
- Systemd touched: $($r.systemdTouched)
- Stream symbols changed: $($r.streamSymbolsChanged)
- Client/Telegram/paper eligibility changed: False / False / False
- Paper run-once/service/boundary changed: False / False / False
- Broker/real money enabled: False / False
- Backup root: $($r.backupRoot)
"@ | Set-Content -LiteralPath $milestoneLocal -Encoding UTF8

Write-Host ""
Write-Host "=== S10.7Y COMPLETE ===" -ForegroundColor Green
Write-Host "OK: $($r.ok)"
Write-Host "Classification: $($r.classification)"
Write-Host "Market-hours gate passed: $($r.marketHoursGatePassed)"
Write-Host "Stages: $($stageLines -join ' ; ')"
Write-Host "Rollback performed: $($r.rollbackPerformed)"
Write-Host "Core25 restored: $($r.productionUniverseRestoredTo25)"
Write-Host "Production payload restored: $($r.productionPayloadRestored)"
Write-Host "Errors: $(@($r.errors)-join ', ')"
Write-Host "Backup root: $($r.backupRoot)"
Write-Host "Report: $reportLocal"
Write-Host "Raw: $rawLocal"
Write-Host "Milestone: $milestoneLocal"

Remove-Item -LiteralPath $workLocal -Recurse -Force -ErrorAction SilentlyContinue

if($remoteExit-ne 0 -or -not $r.ok){
  throw "S10.7Y guarded canary did not complete successfully; Core25 rollback status is in the report"
}
