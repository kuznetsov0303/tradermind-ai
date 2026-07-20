param(
    [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project root not found: $ProjectRoot"
}

$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$StateRoot = Join-Path $ProjectRoot "PROJECT_STATE"
$MilestonesDir = Join-Path $StateRoot "milestones"
$HandoffsDir = Join-Path $StateRoot "handoffs"
$HistoricalHandoffsDir = Join-Path $HandoffsDir "historical"

New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
New-Item -ItemType Directory -Force -Path $MilestonesDir | Out-Null
New-Item -ItemType Directory -Force -Path $HandoffsDir | Out-Null
New-Item -ItemType Directory -Force -Path $HistoricalHandoffsDir | Out-Null

$Now = Get-Date
$Stamp = $Now.ToString("yyyyMMdd_HHmmss")
$IsoNow = $Now.ToString("yyyy-MM-ddTHH:mm:ssK")

function Run-Git {
    param([string[]]$Args)
    try {
        $output = & git -C $ProjectRoot @Args 2>$null
        if ($LASTEXITCODE -eq 0) {
            return ($output -join "`n").Trim()
        }
    } catch {}
    return ""
}

$GitBranch = Run-Git @("branch", "--show-current")
$GitCommit = Run-Git @("rev-parse", "HEAD")
$GitShort = Run-Git @("rev-parse", "--short", "HEAD")
$GitStatus = Run-Git @("status", "--short")

$FileCount = -1
try {
    $FileCount = (Get-ChildItem -LiteralPath $ProjectRoot -File -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch "\\node_modules\\" -and
            $_.FullName -notmatch "\\.git\\" -and
            $_.FullName -notmatch "\\.next\\" -and
            $_.FullName -notmatch "\\.venv\\" -and
            $_.FullName -notmatch "\\venv\\"
        } | Measure-Object).Count
} catch {}

$GitStatusText = if ([string]::IsNullOrWhiteSpace($GitStatus)) { "Clean or unavailable." } else { $GitStatus }

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-StateFile {
    param(
        [string]$RelativePath,
        [string]$Body
    )
    $Path = Join-Path $StateRoot $RelativePath
    $Parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $Parent)) {
        New-Item -ItemType Directory -Force -Path $Parent | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Body, $Utf8NoBom)
}

$MasterPlan = @"
# SkillEdge AI - Master Production Plan

Updated: $IsoNow

## Final product objective

Build and launch a premium, fully automated intraday trading-intelligence SaaS. The launch target is not a temporary MVP.

The final product must:
- ingest real-time US-equities market events continuously;
- scan the market automatically;
- maintain live per-symbol market state;
- generate deterministic strategy candidates;
- validate data quality, context, risk and execution feasibility;
- create client signals only from production-qualified strategy versions;
- manage signal lifecycle in real time;
- maintain honest paper/client-equivalent accountability;
- persist signal, trade, strategy, experiment and AI-research lineage;
- run automatic after-close replay, failure analysis, strategy research and setup discovery;
- test new variants on historical, holdout, walk-forward and forward-shadow evidence;
- prepare approved strategy snapshots for the next session;
- notify Telegram only that a new website signal is available, including time and direct link;
- provide a complete premium frontend with working functionality and production-quality localization;
- self-start, self-monitor, recover from normal failures, back up critical state and support rollback.

## Frozen production architecture

Databento US Equities / EQUS.MINI:
- primary real-time market truth;
- target schema: MBP-1;
- target universe: ALL_SYMBOLS where entitlement and runtime capacity permit;
- used for live trades, BBO/top-of-book state, spread, live lifecycle and derived candles.

FMP Premium:
- retained for fundamentals, profiles, news/catalyst enrichment, reference data and the existing historical-learning pipeline;
- FMP Ultimate is not part of the target stack.

Runtime flow:
Databento -> Market Stream Ingestor -> Normalized MarketEvent -> Market State Engine -> Market-wide Scanner -> Dynamic In-Play Universe -> Strategy Engine -> Confirmation / Signal Blocker / Failure Pattern Intelligence -> Adaptive expectancy / payoff / risk gate -> AI Validator for selected candidates only -> Production-qualified signal -> Website / Telegram notification / client-equivalent paper -> Real-Time Trade Lifecycle -> Immutable outcome and lineage.

Research flow:
Session Day N -> persist signals, rejects, outcomes, MFE/MAE and context -> ingest Day N -> replay 5Y + Day N -> statistics -> failure analysis -> pattern discovery -> AI hypotheses -> new setup/strategy/management variants -> historical replay -> holdout/OOS -> walk-forward -> forward shadow -> production eligibility -> admin approval -> approved Day N+1 strategy snapshot.

## Client strategy policy

Client eligibility requires:
- verified closed-outcome win rate >= 45%;
- positive realized expectancy after conservative execution assumptions;
- acceptable profit factor;
- acceptable drawdown;
- sufficient sample;
- OOS/holdout pass;
- walk-forward pass;
- forward-shadow pass;
- current regime not showing severe decay;
- data-quality pass;
- conservative execution-model pass.

Adaptive extension objective:
- WR 45.0-49.9%: >= 3.0R;
- WR 50.0-54.9%: >= 2.5R;
- WR 55.0-59.9%: >= 2.25R;
- WR 60.0-64.9%: >= 2.0R;
- WR 65.0-69.9%: >= 1.8R;
- WR 70.0-79.9%: >= 1.5R;
- WR >= 80%: >= 1.25R.

Final production eligibility uses realized average win R, realized average loss R, expectancy and profit factor. A distant target alone does not prove payoff quality.

## Dynamic exits

No universal fixed 2R target model.

Each production signal supports:
- Entry;
- Stop;
- T1;
- T2;
- T3 when justified;
- optional runner when justified.

Target selection must be reproducible and based on market structure, historical MFE distribution, volatility, ATR, liquidity, support/resistance, regime and strategy statistics.

## AI authority boundaries

AI may:
- validate selected deterministic candidates;
- analyze failures and successes;
- generate hypotheses;
- propose new filters;
- propose new setup/strategy/management variants;
- discover recurring structures;
- run research workflows;
- nominate promotion candidates.

AI may not:
- bypass hard data/risk/client gates;
- self-release a new unvalidated strategy directly to clients;
- modify production rules intraday without an approved versioned snapshot;
- execute real-money broker orders.

## 28-day production sprint

Day 1: Architecture continuity + Databento activation and live entitlement proof.
Day 2: Canonical MarketEvent contract and provider abstraction.
Day 3: Production market-stream service.
Day 4: Reconnect, stale, sequence, dedup, gap and recovery safety.
Day 5: Real-time market state engine.
Day 6: Candle builder and indicators.
Day 7: Market-wide scanner.
Day 8: Session and regime intelligence.
Day 9: Existing engine bridge.
Day 10: Strategy versioning and snapshots.
Day 11: Event-driven strategy state machines.
Day 12: Adaptive WR/payoff/expectancy engine.
Day 13: Dynamic multi-target engine and management profiles.
Day 14: Complete signal-quality pipeline.
Day 15: Real-time trade lifecycle.
Day 16: Conservative execution model.
Day 17: Shared client/paper core and hard flat no later than 23:00 Kyiv.
Day 18: Canonical data ownership and immutable lineage.
Day 19: AI gateway and AI Validator.
Day 20: Failure Analysis and Strategy Research agents.
Day 21: New Setup Discovery Agent.
Day 22: Automated replay, OOS and walk-forward.
Day 23: Forward shadow, promotion and next-day snapshot.
Day 24: Full autonomous daily/overnight loop.
Day 25: Native realtime frontend transport, Signals and Signal Details.
Day 26: Complete product functionality and localization closure.
Day 27: Exhaustive final audit, load and failure simulation.
Day 28: Production freeze, rollback/recovery proof and premium launch.

## Definition of Done for every major milestone

A milestone is not complete until:
1. implementation is complete;
2. static/compile validation passes;
3. controlled deploy is performed when needed;
4. runtime smoke passes;
5. expected output is validated;
6. no known critical regression is introduced;
7. PROJECT_STATE is updated;
8. HANDOFF_LATEST.md is regenerated;
9. milestone record is written;
10. git commit is created when repository state is safe to commit;
11. NEXT_STEP.md contains exactly the next active milestone.
"@

$Architecture = @"
# SkillEdge AI - Production Architecture

Updated: $IsoNow

## External providers

Databento:
- primary real-time US-equities market-data backbone;
- target service: Databento US Equities;
- dataset: EQUS.MINI;
- primary schema: MBP-1;
- target scope: ALL_SYMBOLS where entitlement and runtime capacity are proven.

FMP Premium:
- fundamentals;
- profiles;
- market-cap/reference enrichment;
- news/catalyst enrichment;
- existing discovery enrichment;
- existing five-year historical research pipeline.

FMP Ultimate is not part of the target architecture.

## Runtime services

1. Market Stream Ingestor
2. Market State Engine
3. Market-wide Scanner
4. Strategy Engine
5. Signal Quality Pipeline
6. Real-Time Trade Lifecycle
7. Native Realtime Client Gateway

Pusher is not part of the required launch architecture. It may be added only if the final load test proves the native gateway cannot meet the required production SLA.

## Persistence

Supabase/Postgres:
- durable product truth for users, entitlements, signals, outcomes, immutable trade ledger, strategy versions, approved snapshots, experiments, AI hypotheses, validation results, promotion records and Admin Hub records.

Upstash Redis:
- cache, locks, deduplication, idempotency, latest snapshots, rate limiting and realtime coordination.

SQLite:
- retained only for explicitly documented operational/research roles until each table has a deliberate canonical owner.

Historical lake:
- compressed historical market and feature data plus metadata/index records.

## Frontend

Vercel hosts website/frontend.

Final signal experience:
- premium signal card;
- live chart;
- entry;
- stop;
- T1/T2/T3;
- optional runner;
- live state;
- management plan;
- invalidation;
- strategy statistics;
- explanation.

Telegram only notifies that a new signal exists and links directly to the website signal page.
"@

$Decisions = @"
# SkillEdge AI - Architecture Decisions

Updated: $IsoNow

D-001 FINAL: Databento US Equities / EQUS.MINI is the primary real-time market source.

D-002 FINAL: FMP Premium remains an enrichment and historical provider. FMP Ultimate is not purchased for realtime.

D-003 FINAL: Event-driven lifecycle replaces polling as primary execution truth. The five-minute evaluator becomes fallback/reconciliation only.

D-004 FINAL: Client strategy minimum WR is 45%, subject to positive expectancy and full validation.

D-005 FINAL: Dynamic multi-target exits replace a universal fixed 2R target.

D-006 FINAL: AI may create, test and nominate strategies but may not auto-release unvalidated strategies to clients.

D-007 FINAL: Native realtime fanout is built and load-tested first. Pusher is not a launch dependency unless measured evidence requires it.

D-008 FINAL: Every major milestone must update PROJECT_STATE and HANDOFF_LATEST.md.
"@

$Costs = @"
# SkillEdge AI - Cost Register

Updated: $IsoNow

ADD:
- Databento US Equities subscription that explicitly includes EQUS.MINI live access. Exact checkout amount must be recorded before payment.
- OpenAI API later, with one shared initial hard cap of USD 49/month.

KEEP:
- FMP Premium;
- current VPS during build;
- Supabase;
- Upstash;
- Vercel.

DO NOT ADD NOW:
- FMP Ultimate;
- Pusher;
- Sentry Team;
- Kafka;
- NATS;
- second VPS.

Initial monitoring:
- Sentry Developer/free tier.

No paid service, upgrade or provider change may be made silently. Exact price, billing model, replacement effect and owner approval are required first.
"@

$CurrentState = @"
# SkillEdge AI - Current State

Generated: $IsoNow

Repository:
- Project root: $ProjectRoot
- Git branch: $GitBranch
- Git commit: $GitCommit
- Git short commit: $GitShort
- Approximate file count: $FileCount

Git status:
$GitStatusText

Production:
- VPS: 178.104.184.138
- Engine root: /opt/skilledge/stock-engine
- FastAPI: /opt/skilledge/stock-engine/app/api/app.py
- API service: skilledge-stock-engine-api.service
- API: 127.0.0.1:8000
- Engine version: holly_persistent_v2

Completed foundations:
- production VPS and HTTPS engine;
- persistent signal/outcome engine;
- historical learning lake;
- 5Y replay foundation;
- walk-forward and promotion-policy foundation;
- forward-shadow;
- paper-accountability foundation;
- runtime/source/systemd reconciliation;
- rollback snapshot and cleanup;
- realtime readiness audit;
- FMP WebSocket investigation.

Current critical limitations:
1. Primary market ingestion is not yet real-time/event-driven.
2. Current point-polling paper evaluator is fallback-quality only.
3. Client-equivalent live lifecycle is not yet driven by one authoritative event stream.
4. Complete AI closed loop is not yet proven end-to-end.
5. Native realtime browser fanout is not yet implemented and load-tested.
6. Full frontend/localization QA is not yet complete.
7. Final database ownership and SQLite/Supabase reconciliation remain open.

Current milestone:
DAY 1 / S10.6A - Continuity bootstrap + Databento activation and live entitlement proof.

Critical invariants:
- broker execution remains disabled;
- no real-money execution;
- no paper reset;
- preserve clean paper boundary 2026-07-13T19:01:07.317798Z;
- no manual paper run-once;
- no automatic release of unvalidated AI-created strategies;
- no weakening of Telegram/client gates;
- payment/pricing implementation is not changed during realtime-engine work.
"@

$NextStep = @"
# NEXT STEP

Updated: $IsoNow

Current milestone:
DAY 1 / S10.6A - Continuity bootstrap + Databento activation and live entitlement proof.

Step A:
Validate PROJECT_STATE files created by this bootstrap.

Step B:
In Databento:
1. open US Equities;
2. select the Standard-class subscription that explicitly includes EQUS.MINI live access;
3. verify exact checkout price before paying;
4. do not purchase Plus, Unlimited, CME or another dataset by mistake;
5. after activation, obtain the Databento API key.

Step C:
Run a read-only Databento entitlement/live smoke:
- never print the key;
- verify EQUS.MINI entitlement;
- verify MBP-1 subscription;
- verify actual live records;
- verify symbol mapping;
- verify timestamps;
- verify BBO/trade fields;
- record results in PROJECT_STATE/milestones.

Do not:
- reset paper;
- call manual paper run-once;
- weaken client or Telegram gates;
- buy FMP Ultimate;
- buy Pusher;
- buy Sentry Team;
- deploy a full local tree over VPS production;
- expose secrets in chat or reports.
"@

$Risks = @"
# SkillEdge AI - Active Risks

Updated: $IsoNow

R-001: Current paper performance is not investor-grade proof because polling can miss intrabar order and produce optimistic fills.
Mitigation: real-time event-driven lifecycle plus conservative fills.

R-002: Full all-symbol Databento processing plus 1000-client fanout is not yet load-tested on the current VPS.
Mitigation: build efficiently, measure, then upgrade only if evidence requires it.

R-003: SQLite/Supabase semantic divergence exists.
Mitigation: explicit canonical ownership and final reconciliation.

R-004: Automatic strategy generation can overfit.
Mitigation: holdout, OOS, walk-forward, sample thresholds, forward shadow and manual production approval.

R-005: Native realtime fanout may or may not satisfy final 1000-client SLA.
Mitigation: final load test before considering Pusher.

R-006: Localization scope must be frozen and completed consistently.
Mitigation: canonical English, terminology glossary, missing-key checks, hardcoded-string checks, contextual review and visual QA.
"@

$DatabaseMap = @"
# SkillEdge AI - Database and Storage Map

Updated: $IsoNow

Supabase/Postgres:
Target durable product source of truth for users, entitlements, signals, outcomes, immutable trade ledger, strategy versions, approved snapshots, experiments, AI hypotheses, validation results, promotion records and Admin Hub records.

Upstash Redis:
Hot/shared state for cache, locks, deduplication, idempotency, latest state snapshots, rate limiting and realtime coordination.

SQLite:
Retained for explicitly documented operational/research roles until canonical ownership is deliberately assigned.

Historical learning lake:
- /opt/skilledge/stock-engine/data/historical_learning

Paper ledger clean boundary:
- 2026-07-13T19:01:07.317798Z

Never reset that boundary without explicit owner instruction.
"@

$Services = @"
# SkillEdge AI - Service Map

Updated: $IsoNow

Known production:
- API service;
- watchdog;
- historical learning/backfill;
- optimizer/research;
- forward-shadow;
- promotion gate;
- post-close workflows;
- paper evaluation;
- guarded paper entry;
- Telegram consumer.

Target new service:
- skilledge-market-stream.service

Never modify or disable unrelated production units during realtime migration.
"@

$ApiMap = @"
# SkillEdge AI - API Map Summary

Updated: $IsoNow

Known important routes:
- GET /health
- GET /engine/status
- POST /engine/discovery/refresh
- GET /debug/candles/{SYMBOL}
- GET /engine/paper/status
- GET /engine/paper/trades
- GET /engine/paper/equity
- POST /engine/paper/evaluate-open
- POST /engine/paper/run-once
- POST /engine/paper/reset?confirm=RESET_50K

Safety:
- do not call paper run-once manually during realtime migration;
- do not reset the clean paper account.
"@

$SystemdMap = @"
# SkillEdge AI - Systemd Map Summary

Updated: $IsoNow

Previously reconciled:
- 31 canonical local systemd definitions matched /etc/systemd/system during the completed parity audit.

Target new service:
- skilledge-market-stream.service

Rule:
Do not modify unrelated production units during realtime migration.
"@

$EnvironmentMap = @"
# SkillEdge AI - Environment Map

Updated: $IsoNow

Local:
- Windows PowerShell
- repository root: $ProjectRoot

Production:
- VPS: 178.104.184.138
- engine: /opt/skilledge/stock-engine
- environment file known: /opt/skilledge/stock-engine/.env.server

Secret policy:
- never print secret values into chat, reports, PROJECT_STATE or git;
- Databento API key will be stored only after activation in an approved secret location;
- diagnostics may record only presence and a non-reversible fingerprint prefix.
"@

$ProductionManifest = @"
# SkillEdge AI - Production Manifest Summary

Updated: $IsoNow

Local repository:
- $ProjectRoot

Local backend mirror:
- services/stock-engine

Production VPS:
- 178.104.184.138

Production engine:
- /opt/skilledge/stock-engine

Production FastAPI:
- /opt/skilledge/stock-engine/app/api/app.py

Production API service:
- skilledge-stock-engine-api.service

Historical learning lake:
- /opt/skilledge/stock-engine/data/historical_learning

Deployment rule:
Never perform a blind full local-tree overwrite of production.

Every deployment must:
- identify exact changed files;
- create rollback material;
- run static checks first;
- deploy only scoped files;
- restart only required services;
- run health/runtime smoke;
- update PROJECT_STATE;
- record the milestone.
"@

$Changelog = @"
# SkillEdge AI - Continuity Changelog

## $IsoNow - Project Continuity System initialized

Created canonical continuity files and set the active milestone to DAY 1 / S10.6A.
"@

$Handoff = @"
# SkillEdge AI - HANDOFF LATEST

Generated: $IsoNow

Read this first:
Continue from the current project state. Do not restart the architecture from scratch.

Project:
SkillEdge AI / UpYourSkills is a premium intraday US-equities trading-intelligence SaaS.

Public site:
https://www.upyourskills.site/

Production VPS:
178.104.184.138

Production engine:
/opt/skilledge/stock-engine

Local repository:
$ProjectRoot

Current engine version:
holly_persistent_v2

Primary realtime provider:
Databento US Equities / EQUS.MINI.

Target schema:
MBP-1.

Target market scope:
ALL_SYMBOLS when entitlement and runtime capacity are proven.

FMP Premium:
retained for fundamentals, profiles, news/catalyst enrichment and existing historical/research integrations.

FMP Ultimate:
do not buy.

Final realtime flow:
Databento -> Market Stream Ingestor -> Normalized MarketEvent -> Market State Engine -> Market-wide Scanner -> Dynamic In-Play Universe -> Strategy Engine -> Confirmation / Signal Blocker / Failure Pattern Intelligence -> Adaptive expectancy/payoff/risk gate -> optional AI Validator -> production-qualified signal -> website / Telegram notification / client-equivalent paper -> real-time lifecycle -> immutable outcome.

Client eligibility:
- minimum WR 45%;
- WR alone is insufficient;
- positive realized expectancy;
- acceptable PF and drawdown;
- adequate sample;
- OOS/holdout pass;
- walk-forward pass;
- forward-shadow pass;
- conservative execution pass;
- data-quality pass.

Adaptive extension objective:
45-49.9% WR >=3R
50-54.9% >=2.5R
55-59.9% >=2.25R
60-64.9% >=2R
65-69.9% >=1.8R
70-79.9% >=1.5R
80%+ >=1.25R

Dynamic exits:
No global fixed 2R target.
Signals support entry, stop, T1, T2, T3 where justified and optional runner.

Autonomous research:
Day N -> 5Y + Day N replay -> statistics -> failure analysis -> pattern discovery -> AI hypotheses -> new setup/strategy/management variants -> replay -> OOS -> walk-forward -> forward shadow -> production eligibility -> admin approval -> Day N+1 approved snapshot.

AI may create/test/nominate strategies.
AI may not directly self-release an unvalidated strategy to clients.

Critical safety invariants:
- no broker execution;
- no real-money execution;
- never reset clean paper boundary 2026-07-13T19:01:07.317798Z;
- no manual paper run-once;
- no weakening of client/Telegram gates;
- payment/pricing logic is not touched during realtime migration;
- no blind full local-tree deploy over production.

Active milestone:
DAY 1 / S10.6A.

Current step:
1. Project Continuity System initialized.
2. Activate Databento US Equities / EQUS.MINI live access.
3. Add Databento API key securely.
4. Run read-only live entitlement smoke.
5. Record exact result.
6. Update PROJECT_STATE and milestone.
7. Commit when safe.

Do not buy now:
- FMP Ultimate;
- Pusher;
- Sentry Team;
- Kafka;
- NATS;
- second VPS.

Next implementation after Databento live proof:
DAY 2 - Canonical MarketEvent contract and provider abstraction.
"@

Write-StateFile "MASTER_PLAN.md" $MasterPlan
Write-StateFile "ARCHITECTURE.md" $Architecture
Write-StateFile "DECISIONS.md" $Decisions
Write-StateFile "COSTS.md" $Costs
Write-StateFile "CURRENT_STATE.md" $CurrentState
Write-StateFile "NEXT_STEP.md" $NextStep
Write-StateFile "RISKS.md" $Risks
Write-StateFile "DATABASE_MAP.md" $DatabaseMap
Write-StateFile "SERVICES.md" $Services
Write-StateFile "API_MAP.md" $ApiMap
Write-StateFile "SYSTEMD_MAP.md" $SystemdMap
Write-StateFile "ENVIRONMENT_MAP.md" $EnvironmentMap
Write-StateFile "PRODUCTION_MANIFEST.md" $ProductionManifest
Write-StateFile "CHANGELOG.md" $Changelog

$Milestone = @"
# S10.6A - Day 1 Continuity Bootstrap

Created: $IsoNow

Completed:
- initialized PROJECT_STATE;
- recorded frozen architecture;
- recorded 28-day plan;
- recorded adaptive WR/payoff policy;
- recorded dynamic exit architecture;
- recorded AI authority boundaries;
- recorded critical production invariants;
- created HANDOFF_LATEST.md.

Production mutation: none.
VPS mutation: none.
Secret values intentionally read: none.

Next:
Activate Databento US Equities / EQUS.MINI live access and run a read-only entitlement/live smoke.
"@

Write-StateFile ("milestones\S10_6A_DAY1_CONTINUITY_BOOTSTRAP_" + $Stamp + ".md") $Milestone
Write-StateFile "handoffs\HANDOFF_LATEST.md" $Handoff
Write-StateFile ("handoffs\historical\HANDOFF_" + $Stamp + ".md") $Handoff

$Summary = [ordered]@{
    ok = $true
    generatedAt = $IsoNow
    projectRoot = $ProjectRoot
    stateRoot = $StateRoot
    gitBranch = $GitBranch
    gitCommit = $GitCommit
    gitShort = $GitShort
    fileCount = $FileCount
    productionMutation = $false
    vpsMutation = $false
    secretValuesReadIntentionally = $false
}

$SummaryPath = Join-Path $StateRoot ("CONTINUITY_BOOTSTRAP_RESULT_" + $Stamp + ".json")
$Summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $SummaryPath -Encoding UTF8

Write-Host ""
Write-Host "=== SKILLEDGE PROJECT CONTINUITY BOOTSTRAP COMPLETE ===" -ForegroundColor Green
Write-Host "Project root: $ProjectRoot"
Write-Host "State root: $StateRoot"
Write-Host "Git branch: $GitBranch"
Write-Host "Git commit: $GitShort"
Write-Host "Handoff: $(Join-Path $HandoffsDir 'HANDOFF_LATEST.md')"
Write-Host "Result JSON: $SummaryPath"
Write-Host ""
Write-Host "NO VPS MUTATION / NO PRODUCTION MUTATION / NO SECRET VALUES OUTPUT." -ForegroundColor Yellow
