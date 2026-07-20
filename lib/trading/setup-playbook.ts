export type SkillEdgeMarketType =
  | "stocks"
  | "crypto"
  | "futures"
  | "forex"
  | "options"
  | "any";

export type SkillEdgeDirection = "long" | "short" | "both";

export type SkillEdgeSetupFamily =
  | "momentum"
  | "gap"
  | "vwap"
  | "opening_range"
  | "failed_breakout"
  | "small_cap_pump_dump"
  | "liquidity_smart_money"
  | "news_catalyst"
  | "crypto_momentum"
  | "mean_reversion"
  | "risk_management";

export type SkillEdgeTimeframe =
  | "1m"
  | "5m"
  | "10m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1D";

export type SkillEdgeSetupDefinition = {
  slug: string;
  name: string;
  family: SkillEdgeSetupFamily;
  marketTypes: SkillEdgeMarketType[];
  direction: SkillEdgeDirection;
  primaryTimeframes: SkillEdgeTimeframe[];
  triggerTimeframe: SkillEdgeTimeframe;
  confirmationTimeframe: SkillEdgeTimeframe;
  confidenceBase: number;
  minimumConfidenceForAlert: number;
  description: string;
  triggerConditions: string[];
  confirmationConditions: string[];
  entryLogic: string[];
  stopLogic: string[];
  targetLogic: string[];
  riskWarnings: string[];
  avoidIf: string[];
  checklist: string[];
  educationNote: string;
  tags: string[];
};

const makeSetup = (setup: SkillEdgeSetupDefinition): SkillEdgeSetupDefinition => setup;

export const SKILLEDGE_SETUP_PLAYBOOK: SkillEdgeSetupDefinition[] = [
  makeSetup({
    slug: "stock_gap_crap_short",
    name: "Gap & Crap Short / Failed Premarket Breakout",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1D", "15m", "5m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "1m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description: "Short setup for an in-play stock that gaps/pumps, fails PMH/HOD/VWAP, forms a lower high, and breaks down.",
    triggerConditions: ["In-play stock with strong volume.", "Gap/pump or strong intraday extension.", "Failed PMH/HOD/VWAP or supply rejection.", "5m lower high or stuff candle."],
    confirmationConditions: ["5m lower high confirmed.", "Break below micro support/VWAP/opening range.", "Selling volume expands or bounce volume fades.", "TP1 has at least 2R room."],
    entryLogic: ["Short after lower high plus breakdown confirmation.", "Prefer failed PMH/HOD/VWAP retest.", "No short if price reclaims the failed high with volume."],
    stopLogic: ["Stop above lower high, failed PMH/HOD, or rejection wick.", "Invalidate on strong reclaim above VWAP/PMH/HOD."],
    targetLogic: ["TP1 at VWAP, opening range low, or nearest intraday demand with at least 2R.", "TP2 at premarket low or next liquidity shelf.", "TP3 at gap-fill/daily support only if structure continues."],
    riskWarnings: ["Do not short only because stock is up.", "Avoid wide spread, halt risk, and strong reclaim.", "No lower high means no setup."],
    avoidIf: ["No lower high.", "No breakdown trigger.", "Spread is too wide.", "TP1 cannot provide 2R."],
    checklist: ["In-play confirmed.", "Failed high/VWAP exists.", "5m lower high.", "Breakdown trigger.", "Stop and TP1 >= 2R."],
    educationNote: "Gap & Crap is a trapped-long failure setup, not random shorting.",
    tags: ["stocks", "small_caps", "gap", "failed_breakout", "short", "vwap"]
  }),
  makeSetup({
    slug: "stock_opening_range_breakout",
    name: "Opening Range Breakout / Breakdown",
    family: "opening_range",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["1D", "15m", "5m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "1m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 84,
    description: "Stock setup where a clean opening range forms and price breaks out/breaks down with volume and room.",
    triggerConditions: ["In-play stock with elevated volume.", "Opening range is clear and not too wide.", "Break of opening range high/low.", "Room to next daily/intraday level."],
    confirmationConditions: ["5m close outside opening range.", "Retest holds or continuation candle confirms.", "Volume expands or stays elevated.", "Entry is not already extended into TP1."],
    entryLogic: ["Enter on breakout/breakdown plus hold or retest.", "Avoid chasing far from range boundary."],
    stopLogic: ["Stop back inside opening range.", "Long invalidates below range high/retest low.", "Short invalidates above range low/retest high."],
    targetLogic: ["TP1 at measured move, HOD/LOD extension, or nearest daily level with at least 2R.", "TP2 at next daily/premarket liquidity level."],
    riskWarnings: ["False ORB is common when range is too wide.", "Avoid if volume dies after break."],
    avoidIf: ["Range too wide.", "No volume confirmation.", "Price rejects back into range.", "RR below 2R."],
    checklist: ["In-play confirmed.", "Opening range clear.", "Break confirmed.", "Retest/hold or strong close.", "Stop and TP1 >= 2R."],
    educationNote: "ORB works best when early inventory is clear and the break has volume, room, and clean invalidation.",
    tags: ["stocks", "orb", "opening_range", "breakout", "breakdown"]
  }),
  makeSetup({
    slug: "stock_vwap_reclaim_rejection",
    name: "VWAP Reclaim / Rejection",
    family: "vwap",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["15m", "5m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "1m",
    confidenceBase: 71,
    minimumConfidenceForAlert: 84,
    description: "Intraday stock setup around VWAP: long after reclaim/hold or short after rejection/loss and failed retest.",
    triggerConditions: ["Stock is in-play.", "Price interacts with VWAP after impulse or failed move.", "Long: VWAP reclaim and hold.", "Short: VWAP rejection/loss and failed retest."],
    confirmationConditions: ["5m higher low after reclaim or lower high after rejection.", "Volume supports reclaim/rejection.", "Entry remains close to VWAP/structure.", "TP1 has at least 2R room."],
    entryLogic: ["Long after VWAP reclaim, retest hold, and break of micro high.", "Short after VWAP rejection/loss, lower high, and break of micro low."],
    stopLogic: ["Long stop under VWAP/retest low.", "Short stop above VWAP/retest high.", "Invalidate if VWAP flips back against the idea with volume."],
    targetLogic: ["TP1 at HOD/LOD, opening range level, or nearest liquidity with at least 2R.", "TP2 at premarket high/low or daily level."],
    riskWarnings: ["VWAP alone is not a signal.", "Weak reclaim/rejection without volume is low quality.", "Avoid late entries far from VWAP."],
    avoidIf: ["No 5m confirmation.", "No volume support.", "Price too far from VWAP.", "TP1 cannot give 2R."],
    checklist: ["VWAP interaction clear.", "5m reclaim/rejection confirmed.", "Micro trigger.", "Stop behind VWAP structure.", "TP1 >= 2R."],
    educationNote: "VWAP is an intraday decision line; the trade comes from VWAP plus structure.",
    tags: ["stocks", "vwap", "reclaim", "rejection"]
  }),
  makeSetup({
    slug: "stock_news_continuation_pullback",
    name: "News Continuation Pullback",
    family: "news_catalyst",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["1D", "15m", "5m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "1m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 84,
    description: "Continuation setup after real catalyst/news/earnings where pullback holds structure and resumes with volume.",
    triggerConditions: ["Real catalyst/news/earnings/guidance/FDA/deal/analyst action.", "Stock moves with above-normal volume.", "Pullback holds VWAP/EMA/breakout/opening range.", "5m structure shifts back in catalyst direction."],
    confirmationConditions: ["Higher low for long or lower high for short.", "Break of pullback high/low with volume.", "VWAP/structure holds.", "TP1 remains at least 2R away."],
    entryLogic: ["Enter after controlled pullback and 5m continuation trigger.", "Do not chase first headline spike."],
    stopLogic: ["Stop below pullback low for long or above pullback high for short.", "Invalidate if catalyst move rejects VWAP/structure."],
    targetLogic: ["TP1 at HOD/LOD or previous daily level with at least 2R.", "TP2 at next daily/intraday liquidity level."],
    riskWarnings: ["News spikes often fail after first emotional move.", "Headline quality matters.", "Avoid if pullback never forms."],
    avoidIf: ["No real catalyst.", "Pullback breaks structure.", "Volume fades hard.", "RR below 2R."],
    checklist: ["Catalyst exists.", "Volume elevated.", "Pullback holds.", "5m continuation trigger.", "Stop and TP1 >= 2R."],
    educationNote: "News Continuation waits for the second decision point after attention arrives.",
    tags: ["stocks", "news", "earnings", "catalyst", "pullback"]
  }),
  makeSetup({
    slug: "stock_trend_continuation_pullback",
    name: "Stock Trend Continuation Pullback",
    family: "momentum",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["1D", "15m", "5m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "1m",
    confidenceBase: 71,
    minimumConfidenceForAlert: 84,
    description: "Intraday stock continuation setup where an in-play ticker holds trend, pulls back in a controlled way to VWAP/EMA/structure, and confirms continuation with a 5m trigger.",
    triggerConditions: [
      "Stock is in-play with elevated volume or strong session attention.",
      "Intraday trend is established and not exhausted.",
      "Pullback is controlled, not a full structure failure.",
      "VWAP/EMA/opening range/previous breakout area acts as structure.",
      "5m continuation trigger appears after the pullback."
    ],
    confirmationConditions: [
      "Trend bias remains aligned with the planned direction.",
      "Pullback quality is acceptable and does not break the key structure.",
      "Volume supports continuation instead of fading completely.",
      "Price is not extended far away from entry/invalidation.",
      "TP1 has at least 2R room before the nearest major level."
    ],
    entryLogic: [
      "Long after a controlled pullback holds structure and breaks the pullback high.",
      "Short after a controlled bounce fails under structure and breaks the pullback low.",
      "Prefer entries near VWAP/EMA/structure, not after a late chase candle.",
      "If the move is already extended into TP1, wait for a new pullback."
    ],
    stopLogic: [
      "Long stop below pullback low, VWAP/EMA reclaim area, or invalidated structure.",
      "Short stop above pullback high, VWAP/EMA rejection area, or invalidated structure.",
      "Invalidate if price flips VWAP/structure against the idea with volume."
    ],
    targetLogic: [
      "TP1 at HOD/LOD, opening range extension, or nearest intraday liquidity with at least 2R.",
      "TP2 at premarket high/low or next daily level.",
      "TP3 only if trend expands with volume and structure keeps holding."
    ],
    riskWarnings: [
      "Continuation is not valid if the trend is already exhausted.",
      "Avoid entries when pullback quality is weak or structure has already failed.",
      "Do not chase far from VWAP/EMA/structure.",
      "Avoid if spread/liquidity makes stop placement unrealistic."
    ],
    avoidIf: [
      "No clear intraday trend.",
      "Pullback breaks the key structure.",
      "Trend exhaustion is high.",
      "Volume is too weak for continuation.",
      "TP1 cannot provide at least 2R."
    ],
    checklist: [
      "In-play stock confirmed.",
      "Intraday trend aligned.",
      "Controlled pullback into structure.",
      "5m continuation trigger.",
      "Logical stop behind structure.",
      "TP1 >= 2R."
    ],
    educationNote: "Trend continuation is a second-decision-point setup. The edge is not the first impulse, but the controlled pullback that proves buyers or sellers are still defending structure.",
    tags: ["stocks", "trend", "continuation", "pullback", "vwap", "ema", "5m"]
  }),
  makeSetup({
    slug: "crypto_liquidity_sweep_reclaim_long",
    name: "Liquidity Sweep + Reclaim Long",
    family: "liquidity_smart_money",
    marketTypes: ["crypto"],
    direction: "long",
    primaryTimeframes: ["4h", "1h", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "5m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description: "Crypto long after sell-side liquidity sweep, reclaim, and 5m higher-low / structure-shift confirmation.",
    triggerConditions: ["Liquid in-play crypto pair.", "Sweep below clear 15m/1H low.", "Reclaim back above swept level.", "BTC/ETH context not strongly against long."],
    confirmationConditions: ["5m higher low or bullish structure shift.", "Reclaim holds.", "Impulse improves after reclaim.", "TP1 to range mid/high gives at least 2R."],
    entryLogic: ["Enter after reclaim and 5m higher-low confirmation.", "Prefer entry near reclaimed level."],
    stopLogic: ["Stop below sweep low.", "Invalidate if price accepts back below reclaimed level."],
    targetLogic: ["TP1 at range mid or nearest 15m/1H liquidity with at least 2R.", "TP2 at range high.", "TP3 at 1H liquidity high if trend continues."],
    riskWarnings: ["No reclaim means no long.", "Avoid strong BTC/ETH dump.", "Do not chase far from reclaim."],
    avoidIf: ["No reclaim.", "No 5m confirmation.", "BTC/ETH strongly against idea.", "TP1 below 2R."],
    checklist: ["Sell-side sweep.", "Reclaim.", "5m higher low/BOS.", "Stop below sweep low.", "TP1 >= 2R."],
    educationNote: "The edge is trapped sellers after a liquidity sweep.",
    tags: ["crypto", "liquidity", "sweep", "reclaim", "long"]
  }),
  makeSetup({
    slug: "crypto_liquidity_sweep_rejection_short",
    name: "Liquidity Sweep + Rejection Short",
    family: "liquidity_smart_money",
    marketTypes: ["crypto"],
    direction: "short",
    primaryTimeframes: ["4h", "1h", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "5m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description: "Crypto short after buy-side liquidity sweep, rejection, and 5m lower-high / breakdown confirmation.",
    triggerConditions: ["Liquid in-play crypto pair.", "Sweep above clear 15m/1H high.", "Reject and return below swept level.", "BTC/ETH context not strongly against short."],
    confirmationConditions: ["5m lower high or bearish structure shift.", "Rejection holds.", "Selling impulse confirms.", "TP1 to range mid/low gives at least 2R."],
    entryLogic: ["Enter after rejection and 5m lower-high/breakdown.", "Prefer entry near rejected level."],
    stopLogic: ["Stop above sweep high.", "Invalidate if price accepts back above swept level."],
    targetLogic: ["TP1 at range mid or nearest 15m/1H liquidity with at least 2R.", "TP2 at range low.", "TP3 at 1H liquidity low if trend continues."],
    riskWarnings: ["Failed short if price reclaims sweep high.", "Avoid strong BTC/ETH squeeze.", "Do not chase far from rejection."],
    avoidIf: ["No rejection.", "No 5m confirmation.", "BTC/ETH strongly against idea.", "TP1 below 2R."],
    checklist: ["Buy-side sweep.", "Rejection.", "5m lower high/breakdown.", "Stop above sweep high.", "TP1 >= 2R."],
    educationNote: "The edge is trapped breakout buyers after a liquidity sweep.",
    tags: ["crypto", "liquidity", "sweep", "rejection", "short"]
  }),
  makeSetup({
    slug: "crypto_trend_pullback_continuation",
    name: "Trend Pullback Continuation",
    family: "momentum",
    marketTypes: ["crypto"],
    direction: "both",
    primaryTimeframes: ["4h", "1h", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "5m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 84,
    description: "Crypto continuation setup where 4H/1H trend is clear, 15m pullback reaches structure, and 5m confirms continuation.",
    triggerConditions: ["4H/1H trend or directional impulse is clear.", "15m pullback reaches structure/VWAP/EMA/FVG/demand/supply/trendline.", "Pullback is controlled.", "5m confirms continuation."],
    confirmationConditions: ["5m structure shift in trend direction.", "Pullback low/high holds.", "BTC/ETH not strongly against idea.", "TP1 gives at least 2R."],
    entryLogic: ["Enter after 5m structure shift from pullback zone.", "Long after higher low and break of pullback high.", "Short after lower high and break of pullback low."],
    stopLogic: ["Stop beyond pullback low/high or invalidated structure.", "Invalidate if trend structure breaks against idea."],
    targetLogic: ["TP1 at previous high/low or nearest 1H liquidity with at least 2R.", "TP2 at continuation extension.", "TP3 at 4H/1H liquidity if momentum persists."],
    riskWarnings: ["Trend pullbacks fail when regime flips.", "Avoid entries before 5m confirmation.", "Do not chase after trend already extended."],
    avoidIf: ["No clear trend.", "Pullback breaks structure.", "No 5m confirmation.", "BTC/ETH against idea.", "TP1 below 2R."],
    checklist: ["4H/1H context aligned.", "15m pullback zone clear.", "5m confirmation.", "Stop behind structure.", "TP1 >= 2R."],
    educationNote: "Continuation is strongest after a controlled pullback into structure.",
    tags: ["crypto", "trend", "pullback", "continuation"]
  }),
  makeSetup({
    slug: "crypto_range_deviation_reversal",
    name: "Range Deviation Reversal",
    family: "mean_reversion",
    marketTypes: ["crypto"],
    direction: "both",
    primaryTimeframes: ["1h", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "5m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 84,
    description: "Crypto range setup where price deviates outside range, fails to hold, returns inside, and confirms reversal on 5m.",
    triggerConditions: ["Clear 15m/1H range exists.", "Price deviates outside range high/low.", "Deviation fails and price returns inside.", "5m confirmation appears after boundary reclaim/rejection."],
    confirmationConditions: ["Return inside range holds.", "5m lower high for short or higher low for long.", "Target to range mid/opposite side gives at least 2R.", "BTC/ETH does not strongly fight reversal."],
    entryLogic: ["Enter after return inside range and 5m confirmation.", "Short after failed range-high breakout.", "Long after failed range-low breakdown."],
    stopLogic: ["Stop beyond deviation wick.", "Invalidate if price accepts outside range."],
    targetLogic: ["TP1 at range mid with at least 2R.", "TP2 at opposite side of range.", "TP3 at next 1H liquidity only if reversal expands."],
    riskWarnings: ["True breakouts can continue hard.", "No return inside range means no reversal.", "Avoid strong BTC/ETH trend against reversal."],
    avoidIf: ["No clear range.", "No return inside range.", "No 5m confirmation.", "TP1 below 2R."],
    checklist: ["Range exists.", "Deviation occurs.", "Price returns inside.", "5m confirmation.", "TP1 >= 2R."],
    educationNote: "Range deviation reversal is a trap setup, not a blind fade.",
    tags: ["crypto", "range", "deviation", "reversal"]
  })
];

export const SKILLEDGE_V1_SETUP_SLUGS = SKILLEDGE_SETUP_PLAYBOOK.map((setup) => setup.slug);

export function isSkillEdgeV1SetupSlug(slug: string) {
  return SKILLEDGE_V1_SETUP_SLUGS.includes(slug);
}

export function getSkillEdgeSetupBySlug(slug: string) {
  return SKILLEDGE_SETUP_PLAYBOOK.find((setup) => setup.slug === slug) ?? null;
}

export function getSkillEdgeSetupsForMarket(marketType: SkillEdgeMarketType) {
  return SKILLEDGE_SETUP_PLAYBOOK.filter(
    (setup) =>
      setup.marketTypes.includes("any") || setup.marketTypes.includes(marketType)
  );
}

export function getSkillEdgeSetupsForDirection(direction: Exclude<SkillEdgeDirection, "both">) {
  return SKILLEDGE_SETUP_PLAYBOOK.filter(
    (setup) => setup.direction === "both" || setup.direction === direction
  );
  
}

export function getSkillEdgeSetupPromptSummary() {
  return SKILLEDGE_SETUP_PLAYBOOK.map((setup) => ({
    slug: setup.slug,
    name: setup.name,
    family: setup.family,
    direction: setup.direction,
    marketTypes: setup.marketTypes,
    triggerTimeframe: setup.triggerTimeframe,
    confirmationTimeframe: setup.confirmationTimeframe,
    minimumConfidenceForAlert: setup.minimumConfidenceForAlert,
    triggerConditions: setup.triggerConditions,
    confirmationConditions: setup.confirmationConditions,
    riskWarnings: setup.riskWarnings,
    avoidIf: setup.avoidIf,
  }));
}
