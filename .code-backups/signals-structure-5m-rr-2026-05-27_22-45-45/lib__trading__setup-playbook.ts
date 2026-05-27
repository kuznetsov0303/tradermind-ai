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

export const SKILLEDGE_SETUP_PLAYBOOK: SkillEdgeSetupDefinition[] = [
  {
    slug: "momentum_continuation",
    name: "Momentum Continuation",
    family: "momentum",
    marketTypes: ["stocks", "crypto", "futures"],
    direction: "both",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 68,
    minimumConfidenceForAlert: 82,
    description:
      "Continuation setup after a strong directional impulse, controlled pullback or consolidation, and renewed expansion with volume.",
    triggerConditions: [
      "Price already made a clean directional impulse.",
      "Pullback or consolidation holds above/below the impulse base.",
      "Volume expands again in the direction of the trend.",
      "The move is not already extremely extended relative to ATR.",
    ],
    confirmationConditions: [
      "Higher low for long or lower high for short.",
      "Break of micro consolidation in the trend direction.",
      "Relative volume remains above normal.",
      "Market context does not strongly fight the trade.",
    ],
    entryLogic: [
      "Enter on reclaim/break of consolidation high for long.",
      "Enter on breakdown of consolidation low for short.",
      "Avoid chasing far from the trigger candle.",
    ],
    stopLogic: [
      "Stop below consolidation low for long.",
      "Stop above consolidation high for short.",
      "Invalidate if the breakout candle fully reverses and loses volume.",
    ],
    targetLogic: [
      "First target at prior impulse extension.",
      "Second target at measured move.",
      "Trail remainder only if volume continues expanding.",
    ],
    riskWarnings: [
      "Late entries after multiple extended candles are lower quality.",
      "Momentum traps often appear when volume fades after breakout.",
      "Avoid oversized position if stop distance is wider than planned risk.",
    ],
    avoidIf: [
      "No fresh volume expansion.",
      "Price is extended far from VWAP and recent base.",
      "Broad market is aggressively reversing against direction.",
    ],
    checklist: [
      "Impulse exists.",
      "Pullback held structure.",
      "Volume confirms continuation.",
      "Entry is close to trigger.",
      "Stop is clearly defined.",
    ],
    educationNote:
      "Momentum continuation works when aggressive buyers or sellers stay in control after the first impulse. The best version gives a controlled pullback, not a vertical chase.",
    tags: ["momentum", "continuation", "volume", "trend"],
  },
  {
    slug: "gap_continuation",
    name: "Gap Continuation",
    family: "gap",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 66,
    minimumConfidenceForAlert: 82,
    description:
      "Continuation setup after a meaningful gap with catalyst, strong opening hold and directional confirmation.",
    triggerConditions: [
      "Stock gaps significantly from the previous close.",
      "Catalyst or news context supports attention.",
      "Opening pullback holds above key level for long or below key level for short.",
      "Volume is clearly elevated versus normal.",
    ],
    confirmationConditions: [
      "VWAP or opening range holds in the direction of the gap.",
      "No immediate full gap rejection.",
      "Relative volume stays elevated.",
      "Spread and liquidity are tradable.",
    ],
    entryLogic: [
      "Enter after opening range break in the gap direction.",
      "Enter on VWAP hold/reclaim after first pullback.",
      "Avoid entering into immediate halt/liquidity risk.",
    ],
    stopLogic: [
      "Stop under opening range low for long.",
      "Stop above opening range high for short.",
      "Invalidate if the gap fully rejects and volume flips against the idea.",
    ],
    targetLogic: [
      "Target intraday extension levels.",
      "Use prior daily levels and premarket high/low as reference.",
      "Reduce if volume dries up after the first target.",
    ],
    riskWarnings: [
      "Gap traps are common when the catalyst is weak.",
      "High spread gaps can turn into slippage traps.",
      "Avoid if first move is already parabolic before trigger.",
    ],
    avoidIf: [
      "No catalyst and no volume.",
      "Gap instantly fills with aggressive opposite pressure.",
      "Stock is illiquid or spread is too wide.",
    ],
    checklist: [
      "Gap is meaningful.",
      "Catalyst exists.",
      "Opening structure holds.",
      "Volume confirms.",
      "Entry/stop are not too wide.",
    ],
    educationNote:
      "Gap continuation requires real attention and a clean hold. The best trades usually come after the first emotional move creates structure.",
    tags: ["gap", "catalyst", "opening_range", "momentum"],
  },
  {
    slug: "vwap_reclaim_continuation",
    name: "VWAP Reclaim Continuation",
    family: "vwap",
    marketTypes: ["stocks", "crypto", "futures"],
    direction: "long",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 84,
    description:
      "Long setup where price loses VWAP, traps sellers, reclaims VWAP and holds above it with improving volume.",
    triggerConditions: [
      "Price trades below VWAP and fails to continue lower.",
      "Reclaim candle closes back above VWAP.",
      "Buyers defend VWAP or reclaim level on retest.",
      "Volume improves during reclaim.",
    ],
    confirmationConditions: [
      "Reclaim holds for at least one confirmation candle.",
      "Pullback does not immediately lose VWAP again.",
      "Relative volume supports the move.",
      "Market context is neutral or supportive.",
    ],
    entryLogic: [
      "Enter on VWAP reclaim hold.",
      "Enter on break of reclaim candle high after retest.",
      "Avoid buying far above VWAP after the reclaim already extended.",
    ],
    stopLogic: [
      "Stop below VWAP reclaim low.",
      "Invalidate if VWAP is lost with strong selling volume.",
      "Tighten risk if reclaim candle is unusually wide.",
    ],
    targetLogic: [
      "First target at prior intraday high.",
      "Second target at liquidity above highs.",
      "Trail if reclaim becomes trend continuation.",
    ],
    riskWarnings: [
      "Failed VWAP reclaims can reverse hard.",
      "Avoid if reclaim volume is weak.",
      "Avoid if broad market is breaking down.",
    ],
    avoidIf: [
      "Reclaim candle is immediately rejected.",
      "No volume improvement.",
      "Entry is too far from VWAP.",
    ],
    checklist: [
      "VWAP reclaimed.",
      "Retest holds.",
      "Volume improves.",
      "Stop is below reclaim structure.",
      "Target has room.",
    ],
    educationNote:
      "VWAP reclaim is a trap-and-reclaim structure. It is strongest when shorts are trapped below VWAP and buyers defend the reclaim.",
    tags: ["vwap", "reclaim", "trap", "long"],
  },
  {
    slug: "vwap_rejection_short",
    name: "VWAP Rejection Short",
    family: "vwap",
    marketTypes: ["stocks", "crypto", "futures"],
    direction: "short",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 84,
    description:
      "Short setup where price tests VWAP from below, fails to reclaim, and sellers regain control.",
    triggerConditions: [
      "Price is below VWAP after a bearish impulse.",
      "Bounce into VWAP fails to reclaim.",
      "Rejection candle forms near VWAP.",
      "Selling volume expands after rejection.",
    ],
    confirmationConditions: [
      "Lower high forms under VWAP.",
      "Breakdown confirms below rejection candle.",
      "Market context is neutral or bearish.",
      "No strong reclaim back above VWAP.",
    ],
    entryLogic: [
      "Enter on rejection candle breakdown.",
      "Enter on lower high under VWAP.",
      "Avoid shorting after an extended flush far from VWAP.",
    ],
    stopLogic: [
      "Stop above VWAP rejection high.",
      "Invalidate if price reclaims VWAP and holds above it.",
    ],
    targetLogic: [
      "First target at intraday low.",
      "Second target at liquidity below lows.",
      "Cover faster if selling volume fades.",
    ],
    riskWarnings: [
      "VWAP rejection can fail if shorts are crowded.",
      "Avoid if the stock has fresh bullish catalyst and reclaim pressure.",
    ],
    avoidIf: [
      "VWAP is reclaimed and held.",
      "No selling volume after rejection.",
      "Broad market is squeezing upward.",
    ],
    checklist: [
      "Below VWAP.",
      "Bounce failed.",
      "Lower high confirmed.",
      "Breakdown has volume.",
      "Stop above rejection high.",
    ],
    educationNote:
      "VWAP rejection short works when trapped buyers fail to reclaim average price and sellers defend VWAP as resistance.",
    tags: ["vwap", "rejection", "short", "trend"],
  },
  {
    slug: "opening_range_breakout",
    name: "Opening Range Breakout",
    family: "opening_range",
    marketTypes: ["stocks", "futures"],
    direction: "long",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 66,
    minimumConfidenceForAlert: 82,
    description:
      "Long setup when price builds an opening range and breaks above it with volume and market confirmation.",
    triggerConditions: [
      "Opening range is clearly defined.",
      "Price compresses near range high.",
      "Breakout occurs with increased volume.",
      "The broader market does not reject the move.",
    ],
    confirmationConditions: [
      "Breakout candle holds above range high.",
      "Retest does not fail back inside the range.",
      "Relative volume is elevated.",
    ],
    entryLogic: [
      "Enter on clean break of opening range high.",
      "Enter on retest hold after breakout.",
      "Avoid chasing if breakout candle is already too extended.",
    ],
    stopLogic: [
      "Stop back inside the opening range.",
      "Invalidate if breakout fails and closes under range high.",
    ],
    targetLogic: [
      "Target measured range extension.",
      "Use premarket high or daily resistance as next target.",
    ],
    riskWarnings: [
      "Opening breakouts fail often without volume.",
      "Avoid if spread is wide or range is too large.",
    ],
    avoidIf: [
      "No volume expansion.",
      "Range is too wide for clean risk.",
      "Market index rejects simultaneously.",
    ],
    checklist: [
      "Range defined.",
      "Compression near high.",
      "Break with volume.",
      "Retest holds or breakout sustains.",
      "Stop is inside range.",
    ],
    educationNote:
      "Opening Range Breakout is strongest when the range creates real pressure and breakout volume confirms fresh demand.",
    tags: ["orb", "breakout", "opening", "long"],
  },
  {
    slug: "opening_range_breakdown",
    name: "Opening Range Breakdown",
    family: "opening_range",
    marketTypes: ["stocks", "futures"],
    direction: "short",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 66,
    minimumConfidenceForAlert: 82,
    description:
      "Short setup when price builds an opening range and breaks below it with selling pressure.",
    triggerConditions: [
      "Opening range is clearly defined.",
      "Price fails to reclaim upper range.",
      "Breakdown occurs below range low with volume.",
      "Market context supports downside or is not fighting the move.",
    ],
    confirmationConditions: [
      "Breakdown candle closes below range low.",
      "Retest fails back under range low.",
      "Selling volume remains elevated.",
    ],
    entryLogic: [
      "Enter on clean break of opening range low.",
      "Enter on retest failure under range low.",
    ],
    stopLogic: [
      "Stop back inside opening range.",
      "Invalidate if price reclaims range low and holds.",
    ],
    targetLogic: [
      "Target measured range extension.",
      "Use premarket low or daily support as next target.",
    ],
    riskWarnings: [
      "Avoid short breakdowns into obvious support without volume.",
      "Breakdown can trap if market squeezes upward.",
    ],
    avoidIf: [
      "No selling volume.",
      "Strong market reversal upward.",
      "Range is too wide for clean stop.",
    ],
    checklist: [
      "Range defined.",
      "Breakdown with volume.",
      "Retest fails.",
      "Stop is clear.",
      "Downside room exists.",
    ],
    educationNote:
      "Opening Range Breakdown is strongest when early buyers fail and price confirms acceptance below the opening range.",
    tags: ["orb", "breakdown", "opening", "short"],
  },
  {
    slug: "failed_breakout_trap_short",
    name: "Failed Breakout Trap Short",
    family: "failed_breakout",
    marketTypes: ["stocks", "crypto", "futures"],
    direction: "short",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description:
      "Short setup after price breaks above a key level, fails to hold, traps breakout buyers and reverses back under the level.",
    triggerConditions: [
      "Price breaks above a visible high or resistance.",
      "Breakout fails to sustain.",
      "Price reclaims back below the breakout level.",
      "Volume shifts against breakout buyers.",
    ],
    confirmationConditions: [
      "Failed breakout candle closes back below level.",
      "Retest of the level fails from below.",
      "Selling pressure expands after the trap.",
    ],
    entryLogic: [
      "Enter after reclaim back below breakout level.",
      "Enter on failed retest from below.",
      "Avoid shorting if price immediately reclaims again.",
    ],
    stopLogic: [
      "Stop above failed breakout high.",
      "Invalidate if price reclaims and holds above the level.",
    ],
    targetLogic: [
      "First target at prior consolidation low.",
      "Second target at liquidity below range.",
    ],
    riskWarnings: [
      "Traps can re-squeeze if short interest is crowded.",
      "Avoid if catalyst is extremely strong and volume keeps expanding upward.",
    ],
    avoidIf: [
      "Breakout holds above level.",
      "No selling confirmation.",
      "Market is strongly trending upward.",
    ],
    checklist: [
      "Breakout happened.",
      "Breakout failed.",
      "Level lost.",
      "Retest failed.",
      "Stop above trap high.",
    ],
    educationNote:
      "Failed breakout traps are powerful because late breakout buyers become forced sellers when price loses the level.",
    tags: ["failed_breakout", "trap", "short", "liquidity"],
  },
  {
    slug: "failed_breakdown_reclaim_long",
    name: "Failed Breakdown Reclaim Long",
    family: "failed_breakout",
    marketTypes: ["stocks", "crypto", "futures"],
    direction: "long",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description:
      "Long setup after price breaks below a key level, fails to continue lower, traps sellers and reclaims the level.",
    triggerConditions: [
      "Price breaks below a visible low or support.",
      "Breakdown fails to continue.",
      "Price reclaims back above the lost level.",
      "Buy volume improves after reclaim.",
    ],
    confirmationConditions: [
      "Reclaim candle closes back above level.",
      "Retest holds above level.",
      "Shorts appear trapped under support.",
    ],
    entryLogic: [
      "Enter after reclaim and hold above the level.",
      "Enter on break of reclaim candle high.",
    ],
    stopLogic: [
      "Stop below failed breakdown low.",
      "Invalidate if price loses the level again with volume.",
    ],
    targetLogic: [
      "First target at range midpoint.",
      "Second target at liquidity above prior high.",
    ],
    riskWarnings: [
      "Failed breakdowns fail if reclaim has no volume.",
      "Avoid if broader market continues breaking down.",
    ],
    avoidIf: [
      "Level reclaim fails.",
      "No volume improvement.",
      "Trend remains strongly bearish.",
    ],
    checklist: [
      "Breakdown trapped sellers.",
      "Level reclaimed.",
      "Retest holds.",
      "Volume improves.",
      "Stop below sweep low.",
    ],
    educationNote:
      "Failed breakdown reclaim works when sellers chase weakness, price reclaims support and trapped shorts fuel the reversal.",
    tags: ["failed_breakdown", "reclaim", "long", "trap"],
  },
  {
    slug: "small_cap_pump_exhaustion_short",
    name: "Small Cap Pump Exhaustion Short",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 74,
    minimumConfidenceForAlert: 86,
    description:
      "Short setup after an aggressive small-cap pump becomes extended, volume peaks, breakout fails and structure breaks.",
    triggerConditions: [
      "Stock is strongly extended intraday or premarket.",
      "Volume spike shows possible climax behavior.",
      "Price fails to hold new highs.",
      "Structure breaks below VWAP, consolidation low or key support.",
    ],
    confirmationConditions: [
      "Lower high forms after failed push.",
      "VWAP or key level is lost.",
      "Selling volume appears after the failed high.",
      "No active halt/squeeze risk at the entry moment.",
    ],
    entryLogic: [
      "Enter after failed high and first lower high.",
      "Enter on VWAP loss/retest failure.",
      "Avoid shorting into active squeeze candles without confirmation.",
    ],
    stopLogic: [
      "Stop above lower high or failed breakout high.",
      "Invalidate if price reclaims VWAP and squeezes with volume.",
    ],
    targetLogic: [
      "First target at VWAP or prior base if entry is above VWAP.",
      "Second target at premarket support.",
      "Third target at deeper liquidity only if dump accelerates.",
    ],
    riskWarnings: [
      "Small-cap shorts can squeeze violently.",
      "Halts, low float and borrow issues can create extreme risk.",
      "Do not short only because price is high; wait for structure break.",
    ],
    avoidIf: [
      "No structure break.",
      "Price is still making clean higher highs.",
      "Borrow/spread/liquidity risk is unacceptable.",
      "Fresh catalyst keeps volume expanding upward.",
    ],
    checklist: [
      "Pump is extended.",
      "Failed high appears.",
      "Lower high forms.",
      "VWAP/key level breaks.",
      "Risk is small and defined.",
    ],
    educationNote:
      "Pump exhaustion short is not about guessing the top. The quality setup appears after the pump fails, structure breaks and trapped longs begin to exit.",
    tags: ["small_cap", "pump", "exhaustion", "short", "vwap"],
  },
  {
    slug: "small_cap_first_red_day",
    name: "Small Cap First Red Day",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["5m", "15m", "1D"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 84,
    description:
      "Short setup after a multi-day small-cap runner starts showing first meaningful downside day with failed pushes and fading volume.",
    triggerConditions: [
      "Stock had a multi-day extension.",
      "Current session fails to hold highs.",
      "Volume no longer supports new highs.",
      "Price breaks prior intraday support or VWAP.",
    ],
    confirmationConditions: [
      "Daily chart is extended.",
      "Intraday lower highs appear.",
      "Failed reclaim of VWAP or key level.",
    ],
    entryLogic: [
      "Enter after failed push and lower high.",
      "Enter on VWAP rejection or support break.",
    ],
    stopLogic: [
      "Stop above lower high or day high.",
      "Invalidate if stock reclaims high with strong volume.",
    ],
    targetLogic: [
      "Target prior day support.",
      "Cover into flushes instead of waiting for perfect bottom.",
    ],
    riskWarnings: [
      "Multi-day runners can squeeze again.",
      "Size smaller if float/spread risk is high.",
    ],
    avoidIf: [
      "Fresh catalyst restarts volume.",
      "No lower high yet.",
      "Price still holds above VWAP cleanly.",
    ],
    checklist: [
      "Multi-day extension.",
      "First weakness day.",
      "VWAP/key level lost.",
      "Lower high confirmed.",
      "Stop clearly defined.",
    ],
    educationNote:
      "First Red Day focuses on the first real shift from hype continuation to distribution. Confirmation matters more than predicting the exact top.",
    tags: ["small_cap", "first_red_day", "pump_dump", "short"],
  },
  {
    slug: "liquidity_sweep_reclaim_long",
    name: "Liquidity Sweep + Reclaim Long",
    family: "liquidity_smart_money",
    marketTypes: ["stocks", "crypto", "futures", "forex"],
    direction: "long",
    primaryTimeframes: ["5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description:
      "Long setup after price sweeps sell-side liquidity below a low, fails to continue lower and reclaims the range.",
    triggerConditions: [
      "Price sweeps a visible prior low.",
      "Break below low fails to continue.",
      "Price reclaims back above the swept level.",
      "Displacement or strong reclaim candle appears.",
    ],
    confirmationConditions: [
      "Reclaim holds above swept level.",
      "Market structure shifts from downside to upside.",
      "Entry is near reclaim or pullback into imbalance/POI.",
    ],
    entryLogic: [
      "Enter on reclaim hold above swept low.",
      "Enter on pullback after displacement if risk remains clean.",
    ],
    stopLogic: [
      "Stop below sweep low.",
      "Invalidate if price loses sweep low again with acceptance.",
    ],
    targetLogic: [
      "Target range midpoint.",
      "Target buy-side liquidity above equal highs.",
      "Scale if price reaches premium area.",
    ],
    riskWarnings: [
      "Sweep without reclaim is not a long setup.",
      "Avoid if higher timeframe trend strongly supports downside continuation.",
    ],
    avoidIf: [
      "No reclaim after sweep.",
      "No displacement or structure shift.",
      "Entry is too far from sweep low.",
    ],
    checklist: [
      "Sell-side liquidity swept.",
      "Reclaim confirmed.",
      "Stop below sweep.",
      "Upside liquidity target exists.",
      "Risk/reward is clean.",
    ],
    educationNote:
      "Liquidity sweep + reclaim works when price runs stops below a low, fails to continue, and trapped sellers fuel the move back into the range.",
    tags: ["liquidity", "sweep", "reclaim", "smart_money", "long"],
  },
  {
    slug: "liquidity_sweep_rejection_short",
    name: "Liquidity Sweep + Rejection Short",
    family: "liquidity_smart_money",
    marketTypes: ["stocks", "crypto", "futures", "forex"],
    direction: "short",
    primaryTimeframes: ["5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description:
      "Short setup after price sweeps buy-side liquidity above a high, fails to hold and rejects back into range.",
    triggerConditions: [
      "Price sweeps a visible prior high.",
      "Break above high fails to continue.",
      "Price rejects back below the swept level.",
      "Selling displacement or strong rejection candle appears.",
    ],
    confirmationConditions: [
      "Rejection holds below swept level.",
      "Market structure shifts from upside to downside.",
      "Entry is near rejection or pullback into a premium zone.",
    ],
    entryLogic: [
      "Enter on rejection below swept high.",
      "Enter on lower high after displacement if risk remains clean.",
    ],
    stopLogic: [
      "Stop above sweep high.",
      "Invalidate if price reclaims above swept high and holds.",
    ],
    targetLogic: [
      "Target range midpoint.",
      "Target sell-side liquidity below equal lows.",
      "Scale if price reaches discount area.",
    ],
    riskWarnings: [
      "Sweep without rejection is not a short setup.",
      "Avoid if higher timeframe trend strongly supports upside continuation.",
    ],
    avoidIf: [
      "No rejection after sweep.",
      "No downside displacement.",
      "Entry is too far from sweep high.",
    ],
    checklist: [
      "Buy-side liquidity swept.",
      "Rejection confirmed.",
      "Stop above sweep.",
      "Downside liquidity target exists.",
      "Risk/reward is clean.",
    ],
    educationNote:
      "Liquidity sweep + rejection works when price runs stops above a high, fails to hold, and trapped breakout buyers fuel the reversal.",
    tags: ["liquidity", "sweep", "rejection", "smart_money", "short"],
  },
  {
    slug: "fvg_displacement_continuation",
    name: "Displacement + Imbalance Continuation",
    family: "liquidity_smart_money",
    marketTypes: ["stocks", "crypto", "futures", "forex"],
    direction: "both",
    primaryTimeframes: ["5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 69,
    minimumConfidenceForAlert: 83,
    description:
      "Continuation setup after displacement creates imbalance and price pulls back into a fair-value/inefficiency area before continuing.",
    triggerConditions: [
      "Strong displacement candle appears.",
      "Structure breaks in the direction of displacement.",
      "Price pulls back into imbalance or point of interest.",
      "Pullback holds without invalidating structure.",
    ],
    confirmationConditions: [
      "Reaction from imbalance/POI appears.",
      "Micro structure turns back in trend direction.",
      "Volume or momentum confirms continuation.",
    ],
    entryLogic: [
      "Enter on reaction from imbalance/POI.",
      "Enter on micro break back in direction of displacement.",
    ],
    stopLogic: [
      "Stop beyond the POI or swing that created displacement.",
      "Invalidate if price fully accepts through the imbalance.",
    ],
    targetLogic: [
      "Target liquidity in displacement direction.",
      "Use prior swing highs/lows as partial targets.",
    ],
    riskWarnings: [
      "Not every imbalance is tradable.",
      "Avoid if pullback is too deep and structure is damaged.",
    ],
    avoidIf: [
      "No real displacement.",
      "No structure break.",
      "Price trades through POI without reaction.",
    ],
    checklist: [
      "Displacement exists.",
      "Structure broke.",
      "Pullback enters POI.",
      "Reaction confirms.",
      "Invalidation is close.",
    ],
    educationNote:
      "Displacement continuation is strongest when a real order-flow shift creates imbalance and price returns to rebalance before continuing.",
    tags: ["imbalance", "fvg", "displacement", "continuation"],
  },
  {
    slug: "news_catalyst_momentum",
    name: "News Catalyst Momentum",
    family: "news_catalyst",
    marketTypes: ["stocks", "crypto"],
    direction: "both",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 67,
    minimumConfidenceForAlert: 82,
    description:
      "Momentum setup where fresh catalyst, abnormal attention and volume create tradable directional opportunity.",
    triggerConditions: [
      "Fresh catalyst or headline exists.",
      "Price reacts with abnormal volume.",
      "Move holds above/below key level instead of instantly fading.",
      "Liquidity is sufficient for planned risk.",
    ],
    confirmationConditions: [
      "Catalyst reaction sustains beyond first spike.",
      "Volume remains elevated.",
      "Price forms tradable structure after initial news reaction.",
    ],
    entryLogic: [
      "Enter after first structure forms, not on the first emotional candle.",
      "Enter on continuation break or VWAP reclaim/rejection depending on direction.",
    ],
    stopLogic: [
      "Stop beyond structure created after news reaction.",
      "Invalidate if catalyst move fully fades.",
    ],
    targetLogic: [
      "Target premarket high/low, daily levels, liquidity zones.",
      "Scale if news momentum slows.",
    ],
    riskWarnings: [
      "News spikes can reverse fast.",
      "Avoid thin liquidity and wide spreads.",
      "Do not trust catalyst without price/volume confirmation.",
    ],
    avoidIf: [
      "No sustained reaction after headline.",
      "Volume fades immediately.",
      "Spread/liquidity risk is unacceptable.",
    ],
    checklist: [
      "Catalyst exists.",
      "Volume confirms.",
      "Structure forms.",
      "Entry is after confirmation.",
      "Risk is defined.",
    ],
    educationNote:
      "Catalyst momentum is strongest when news creates real attention and price builds structure instead of only making one emotional spike.",
    tags: ["news", "catalyst", "momentum", "volume"],
  },
  {
    slug: "crypto_squeeze_continuation",
    name: "Crypto Squeeze Continuation",
    family: "crypto_momentum",
    marketTypes: ["crypto"],
    direction: "long",
    primaryTimeframes: ["5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 67,
    minimumConfidenceForAlert: 82,
    description:
      "Crypto continuation setup after price breaks compression, volume expands and short-side pressure fuels upside movement.",
    triggerConditions: [
      "Crypto pair breaks compression or range high.",
      "Volume expands above normal.",
      "Price holds above breakout/reclaim level.",
      "BTC/market context does not strongly reject.",
    ],
    confirmationConditions: [
      "Retest of breakout holds.",
      "Higher low forms after expansion.",
      "Momentum does not immediately fade.",
    ],
    entryLogic: [
      "Enter on retest hold after compression breakout.",
      "Enter on micro continuation if risk is still controlled.",
    ],
    stopLogic: [
      "Stop below breakout/retest low.",
      "Invalidate if price falls back inside range with volume.",
    ],
    targetLogic: [
      "Target range extension.",
      "Target liquidity above recent highs.",
      "Scale if funding/volatility risk becomes extreme.",
    ],
    riskWarnings: [
      "Crypto can reverse violently after squeezes.",
      "Avoid high leverage logic and wide stops.",
      "BTC context matters.",
    ],
    avoidIf: [
      "BTC is rejecting strongly.",
      "Breakout instantly fails.",
      "Move is already too extended.",
    ],
    checklist: [
      "Compression broke.",
      "Volume expanded.",
      "Retest held.",
      "BTC context acceptable.",
      "Risk is controlled.",
    ],
    educationNote:
      "Crypto squeeze continuation needs compression, expansion and hold. The best entry is usually after confirmation, not the first candle.",
    tags: ["crypto", "squeeze", "continuation", "volume"],
  },
  {
    slug: "crypto_dump_reversal_reclaim",
    name: "Crypto Dump Reversal Reclaim",
    family: "crypto_momentum",
    marketTypes: ["crypto"],
    direction: "long",
    primaryTimeframes: ["5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 68,
    minimumConfidenceForAlert: 83,
    description:
      "Reversal setup after aggressive crypto dump sweeps liquidity, stops accelerating and reclaims key level.",
    triggerConditions: [
      "Aggressive downside move sweeps recent lows.",
      "Selling acceleration slows.",
      "Price reclaims a key breakdown level.",
      "Volume confirms reversal attempt.",
    ],
    confirmationConditions: [
      "Higher low forms after reclaim.",
      "BTC/market context stabilizes.",
      "No immediate rejection back below reclaim level.",
    ],
    entryLogic: [
      "Enter on reclaim hold.",
      "Enter on higher low after reversal impulse.",
    ],
    stopLogic: [
      "Stop below sweep low.",
      "Invalidate if reclaim level is lost again.",
    ],
    targetLogic: [
      "Target range midpoint.",
      "Target prior breakdown level or liquidity above.",
    ],
    riskWarnings: [
      "Catching falling knives is dangerous without reclaim.",
      "Avoid if liquidation cascade continues.",
    ],
    avoidIf: [
      "No reclaim.",
      "BTC keeps dumping.",
      "No higher low after reversal attempt.",
    ],
    checklist: [
      "Liquidity swept.",
      "Selling slows.",
      "Level reclaimed.",
      "Higher low forms.",
      "Stop below sweep.",
    ],
    educationNote:
      "Crypto dump reversal is not about buying weakness blindly. The setup starts only after reclaim and structure confirmation.",
    tags: ["crypto", "dump", "reversal", "reclaim"],
  },
  {
    slug: "controlled_pullback_to_vwap",
    name: "Controlled Pullback to VWAP",
    family: "vwap",
    marketTypes: ["stocks", "crypto", "futures"],
    direction: "both",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 66,
    minimumConfidenceForAlert: 82,
    description:
      "Trend continuation setup where price pulls back into VWAP or dynamic mean, holds, and resumes the trend.",
    triggerConditions: [
      "Clear intraday trend exists.",
      "Pullback is controlled, not panic reversal.",
      "VWAP or dynamic mean holds.",
      "Continuation candle appears from the pullback zone.",
    ],
    confirmationConditions: [
      "Trend structure remains intact.",
      "Pullback volume is lower than impulse volume.",
      "Continuation volume increases.",
    ],
    entryLogic: [
      "Enter on hold and turn from VWAP/pullback zone.",
      "Enter on micro break in trend direction after hold.",
    ],
    stopLogic: [
      "Stop beyond VWAP/pullback low for long.",
      "Stop beyond VWAP/pullback high for short.",
    ],
    targetLogic: [
      "Target prior trend extreme.",
      "Target extension if trend accelerates.",
    ],
    riskWarnings: [
      "Pullback becomes reversal if structure breaks.",
      "Avoid if VWAP is lost and not reclaimed.",
    ],
    avoidIf: [
      "Trend is unclear.",
      "Pullback volume is aggressive against trend.",
      "Market context reverses strongly.",
    ],
    checklist: [
      "Trend exists.",
      "Pullback is controlled.",
      "VWAP/mean holds.",
      "Continuation confirms.",
      "Stop is close.",
    ],
    educationNote:
      "Controlled pullback to VWAP is a trend trade. The edge comes from entering near the mean while trend structure remains intact.",
    tags: ["vwap", "pullback", "trend", "continuation"],
  },

    {
    slug: "breakout_hold_limit",
    name: "Breakout + Hold + Limit",
    family: "failed_breakout",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["1m", "5m", "15m"],
    triggerTimeframe: "1m",
    confirmationTimeframe: "5m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description:
      "Level breakout setup where price approaches a confirmed level smoothly, breaks it, holds/retests and gives a controlled limit entry with tight invalidation.",
    triggerConditions: [
      "Local trend exists for 2–3 days or current session has clean directional context.",
      "First hour volume is elevated.",
      "Price approaches a confirmed level smoothly.",
      "Breakout happens through a clean level, not inside a messy zone.",
      "Price holds or retests the level for at least two small confirmation candles.",
    ],
    confirmationConditions: [
      "M5 candles are clean and without aggressive opposite wicks.",
      "M1 shows breakout, hold/retest and controlled entry area.",
      "Spread is acceptable for the stock price.",
      "Entry is close to the level, not far after extension.",
    ],
    entryLogic: [
      "Use limit entry near the confirmed retest/hold area.",
      "Long: enter after breakout above level and hold above it.",
      "Short: enter after breakdown below level and hold below it.",
    ],
    stopLogic: [
      "Stop behind the retest/hold structure.",
      "Invalidate if price accepts back under/above the broken level.",
      "Avoid if stop becomes too wide relative to target.",
    ],
    targetLogic: [
      "Target the next intraday liquidity level.",
      "Use prior high/low, daily level or measured move as target.",
      "Take partials if price reaches first liquidity zone fast.",
    ],
    riskWarnings: [
      "False breakout risk is high if level is messy.",
      "Avoid sharp vertical approach directly into level.",
      "Avoid if confirmation candles have large opposite wicks.",
    ],
    avoidIf: [
      "Dirty level or congested zone.",
      "Deep false break before setup.",
      "Large candles into the level.",
      "Opposite-side pressure appears before entry.",
    ],
    checklist: [
      "Confirmed level.",
      "Smooth approach.",
      "Breakout happened.",
      "Hold/retest confirmed.",
      "Limit entry close to level.",
      "Stop is tight and logical.",
    ],
    educationNote:
      "Breakout + Hold + Limit is not a chase breakout. The edge comes after price proves acceptance beyond the level and gives a controlled retest entry.",
    tags: ["level", "breakout", "retest", "limit_entry", "day_trading"],
  },
  {
    slug: "bounce_limit",
    name: "Bounce + Limit",
    family: "mean_reversion",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["1m", "5m", "15m"],
    triggerTimeframe: "1m",
    confirmationTimeframe: "5m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 83,
    description:
      "Controlled bounce setup from a confirmed level after smooth approach, clean reaction and limit entry near the level.",
    triggerConditions: [
      "Confirmed intraday or daily level is visible.",
      "First hour volume is above normal.",
      "Price approaches the level smoothly.",
      "M5 candles are clean without strong opposite tails.",
      "M1 shows controlled reaction from the level.",
    ],
    confirmationConditions: [
      "Small false poke is acceptable if price quickly reclaims the level.",
      "Reaction candle confirms buyer/seller defense.",
      "No deep acceptance through the level.",
      "Entry remains close to invalidation.",
    ],
    entryLogic: [
      "Long: enter near support after bounce confirmation.",
      "Short: enter near resistance after rejection confirmation.",
      "Use limit entry only after reaction is visible.",
    ],
    stopLogic: [
      "Stop behind the level or behind the false-poke extreme.",
      "Invalidate if price accepts through the level.",
    ],
    targetLogic: [
      "Target midpoint of range first.",
      "Second target at opposite side of range or next liquidity.",
      "Reduce if bounce loses momentum quickly.",
    ],
    riskWarnings: [
      "Do not buy/sell only because price touched a level.",
      "Deep level violation reduces quality.",
      "Messy zones produce unreliable bounces.",
    ],
    avoidIf: [
      "Deep false break through level.",
      "Level is already heavily damaged.",
      "Approach is too sharp and emotional.",
      "No clean reaction candle.",
    ],
    checklist: [
      "Level confirmed.",
      "Smooth approach.",
      "Clean reaction.",
      "Entry close to invalidation.",
      "Target room is enough.",
    ],
    educationNote:
      "Bounce + Limit works when the level is respected and the reaction gives clean risk. The trade is invalid if the level stops acting as support/resistance.",
    tags: ["level", "bounce", "limit_entry", "mean_reversion"],
  },
  {
    slug: "daily_level_false_break_retest",
    name: "Daily Level False Break + Retest",
    family: "failed_breakout",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["1m", "5m", "15m", "1D"],
    triggerTimeframe: "1m",
    confirmationTimeframe: "5m",
    confidenceBase: 74,
    minimumConfidenceForAlert: 85,
    description:
      "Daily level trap setup where price breaks a daily level, fails to continue, volatility fades, and price retests/holds the level from the other side.",
    triggerConditions: [
      "Daily level is clear and confirmed.",
      "First hour volume is elevated.",
      "Price approaches the level quickly.",
      "Move already travelled a large part of ATR.",
      "False break occurs and price cannot renew low/high after the break.",
    ],
    confirmationConditions: [
      "Volatility fades after the false break.",
      "Price reclaims or rejects the daily level.",
      "Retest confirms the level after reclaim/rejection.",
      "M1/M5 structure supports the reversal.",
    ],
    entryLogic: [
      "Long: enter after false breakdown and reclaim/retest above daily level.",
      "Short: enter after false breakout and rejection/retest below daily level.",
    ],
    stopLogic: [
      "Stop beyond the false-break extreme.",
      "Invalidate if price accepts beyond the daily level again.",
    ],
    targetLogic: [
      "Target range midpoint first.",
      "Second target at opposite liquidity or prior intraday high/low.",
    ],
    riskWarnings: [
      "False break without reclaim/retest is not enough.",
      "If volatility expands against the idea, skip.",
      "Avoid if stop is too wide after the false break.",
    ],
    avoidIf: [
      "No volatility fade.",
      "Level is not confirmed.",
      "Price accepts beyond level.",
      "No retest after reclaim/rejection.",
    ],
    checklist: [
      "Daily level confirmed.",
      "False break happened.",
      "Price failed to continue.",
      "Volatility faded.",
      "Retest confirmed.",
      "Stop behind false-break extreme.",
    ],
    educationNote:
      "Daily level false break + retest traps traders who chased the level break. The best entry comes after price proves that the break failed.",
    tags: ["daily_level", "false_break", "retest", "trap"],
  },
  {
    slug: "premarket_pump_exhaustion_short",
    name: "Premarket Pump Exhaustion Short",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 76,
    minimumConfidenceForAlert: 86,
    description:
      "User-style premarket short after a gap/pump loses momentum, fails to renew highs, forms lower high and breaks VWAP or micro-structure.",
    triggerConditions: [
      "US premarket is active, especially from 13:00 Kyiv onward.",
      "Stock has gap/pump with abnormal premarket volume.",
      "First aggressive push starts slowing.",
      "High is not renewed or breakout fails.",
      "Lower high forms after the failed push.",
    ],
    confirmationConditions: [
      "VWAP is lost or rejected.",
      "Bounce volume fades.",
      "Selling pressure appears on breakdown.",
      "Spread and borrow risk are acceptable.",
      "No active squeeze/halt behavior at trigger.",
    ],
    entryLogic: [
      "Enter after failed high + lower high.",
      "Enter on VWAP loss or VWAP rejection retest.",
      "Avoid shorting the first vertical push without confirmation.",
    ],
    stopLogic: [
      "Stop above lower high or failed high.",
      "Invalidate if price reclaims VWAP and holds above it.",
      "Invalidate if new high is made on strong volume.",
    ],
    targetLogic: [
      "First target at VWAP/prior base depending on entry.",
      "Second target at premarket support.",
      "Third target only if dump accelerates with volume.",
    ],
    riskWarnings: [
      "Small-cap premarket shorts can squeeze violently.",
      "Low float, halt risk and borrow problems must reduce confidence.",
      "Do not short only because price is high; wait for structure break.",
    ],
    avoidIf: [
      "Still making clean higher highs.",
      "No lower high.",
      "VWAP is holding as support.",
      "Fresh catalyst keeps volume expanding upward.",
    ],
    checklist: [
      "Gap/pump exists.",
      "High failed.",
      "Lower high formed.",
      "VWAP/key level lost or rejected.",
      "Stop is above structure.",
      "RR is at least acceptable.",
    ],
    educationNote:
      "This is the core premarket short fingerprint: do not predict the top, wait for failed continuation, lower high and a clean level/VWAP break.",
    tags: ["premarket", "short", "pump", "vwap", "lower_high", "user_fingerprint"],
  },
  {
    slug: "first_push_fade_short",
    name: "First Push Fade Short",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "10m"],
    triggerTimeframe: "1m",
    confirmationTimeframe: "5m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description:
      "Short setup after the first emotional premarket/open push fails to get continuation and sellers push price back into range.",
    triggerConditions: [
      "First aggressive push appears during premarket or market open.",
      "Follow-through is weak after the push.",
      "High is not renewed.",
      "Price returns below the push base or key micro-level.",
    ],
    confirmationConditions: [
      "Volume on continuation attempt fades.",
      "Rejection candle appears near high.",
      "Micro lower high forms.",
      "Breakdown confirms under the push base.",
    ],
    entryLogic: [
      "Enter after failed follow-through and micro breakdown.",
      "Aggressive entry only if rejection is very clear and stop is tight.",
    ],
    stopLogic: [
      "Stop above failed push high.",
      "Invalidate if price reclaims high and holds.",
    ],
    targetLogic: [
      "Target VWAP or prior premarket base.",
      "Cover into fast flushes if volume accelerates.",
    ],
    riskWarnings: [
      "First push fade is dangerous if momentum is still expanding.",
      "Avoid if push consolidates tightly near high with strong bid.",
    ],
    avoidIf: [
      "Clean continuation above high.",
      "Volume increases on breakout.",
      "No rejection or lower high.",
    ],
    checklist: [
      "First push happened.",
      "No follow-through.",
      "High failed.",
      "Micro breakdown confirmed.",
      "Stop above failed high.",
    ],
    educationNote:
      "First Push Fade is based on failed emotional momentum. The setup starts only after the push fails, not during the vertical move.",
    tags: ["premarket", "open", "first_push", "fade", "short"],
  },
  {
    slug: "lower_high_under_vwap_short",
    name: "Lower High Under VWAP Short",
    family: "vwap",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 75,
    minimumConfidenceForAlert: 86,
    description:
      "Short setup where price is below VWAP, bounce fails under VWAP, lower high forms and breakdown resumes.",
    triggerConditions: [
      "Price is trading below VWAP after bearish shift.",
      "Bounce into VWAP or prior support fails.",
      "Lower high forms under VWAP.",
      "Breakdown starts below lower-high base.",
    ],
    confirmationConditions: [
      "VWAP is not reclaimed.",
      "Bounce volume is weaker than sell impulse.",
      "Selling volume improves on breakdown.",
      "Market/open context does not squeeze against the short.",
    ],
    entryLogic: [
      "Enter near lower high rejection or on breakdown after lower high.",
      "Best entry is close to VWAP/rejection with defined stop.",
    ],
    stopLogic: [
      "Stop above lower high.",
      "Invalidate if VWAP is reclaimed and held.",
    ],
    targetLogic: [
      "First target at prior intraday low.",
      "Second target at premarket support or liquidity below lows.",
    ],
    riskWarnings: [
      "Avoid shorting far below VWAP after the move already flushed.",
      "VWAP reclaim can squeeze late shorts.",
    ],
    avoidIf: [
      "VWAP reclaimed.",
      "No lower high.",
      "Breakdown has no volume.",
    ],
    checklist: [
      "Below VWAP.",
      "Bounce failed.",
      "Lower high confirmed.",
      "Breakdown started.",
      "Stop above lower high.",
    ],
    educationNote:
      "Lower High Under VWAP is one of the cleanest short structures because it shows sellers defending average price and buyers failing to regain control.",
    tags: ["vwap", "lower_high", "short", "premarket", "day_trading"],
  },
  {
    slug: "failed_premarket_breakout_stuff_short",
    name: "Failed Premarket Breakout / Stuff Short",
    family: "failed_breakout",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "10m"],
    triggerTimeframe: "1m",
    confirmationTimeframe: "5m",
    confidenceBase: 76,
    minimumConfidenceForAlert: 86,
    description:
      "Short setup after price breaks premarket high or visible resistance, gets stuffed by sellers and returns below the breakout level.",
    triggerConditions: [
      "Price pushes above PMH or clear resistance.",
      "Breakout does not hold.",
      "Selling pressure appears immediately above the level.",
      "Price returns back below breakout level.",
    ],
    confirmationConditions: [
      "Large upper wick or fast rejection.",
      "Volume spike without continuation.",
      "Failed retest from below improves quality.",
      "Breakout buyers are trapped.",
    ],
    entryLogic: [
      "Enter after price returns below the breakout level.",
      "Enter on failed retest from below if available.",
    ],
    stopLogic: [
      "Stop above stuff high.",
      "Invalidate if price reclaims PMH/resistance and holds.",
    ],
    targetLogic: [
      "First target at breakout base.",
      "Second target at VWAP or premarket support.",
    ],
    riskWarnings: [
      "Stuff shorts can re-squeeze if price reclaims the level.",
      "Avoid if breakout volume continues expanding upward.",
    ],
    avoidIf: [
      "Breakout holds above level.",
      "No rejection candle.",
      "No selling confirmation.",
    ],
    checklist: [
      "PMH/resistance broken.",
      "Breakout stuffed.",
      "Price back below level.",
      "Stop above stuff high.",
      "Downside target exists.",
    ],
    educationNote:
      "Stuff short works because breakout buyers get trapped above the level. The key is waiting for price to lose the breakout level again.",
    tags: ["stuff", "pmh", "failed_breakout", "short", "jtrader_style"],
  },
  {
    slug: "gap_crap_short",
    name: "GapCrap Short",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 77,
    minimumConfidenceForAlert: 87,
    description:
      "Small-cap gap-up fade setup where a weak/overextended premarket gap fails PMH/VWAP/Golden Zone and starts fading toward lower liquidity.",
    triggerConditions: [
      "Large premarket gap up, ideally with abnormal volume.",
      "Catalyst quality is weak, promotional or already priced in.",
      "Stock is extended from VWAP or key moving mean.",
      "PMH/Golden Zone/VWAP rejection appears.",
      "Structure shifts from pump to fade.",
    ],
    confirmationConditions: [
      "Failed push above PMH or rejection near Golden Zone.",
      "Lower high after failed push.",
      "VWAP loss or VWAP rejection.",
      "Selling volume appears after the failed push.",
    ],
    entryLogic: [
      "Enter after PMH/Golden Zone rejection and lower high.",
      "Enter after VWAP loss/retest failure.",
      "Avoid early top-ticking without structure.",
    ],
    stopLogic: [
      "Stop above failed high/Golden Zone rejection.",
      "Invalidate if PMH is reclaimed and held with volume.",
    ],
    targetLogic: [
      "Target VWAP first if entry is above it.",
      "Target premarket support and liquidity below.",
      "Use partial covers into fast fades.",
    ],
    riskWarnings: [
      "GapCrap shorts are high risk if float is low and volume keeps rotating.",
      "Halt/squeeze/borrow risks must reduce signal quality.",
      "Weak catalyst helps, but price confirmation is still required.",
    ],
    avoidIf: [
      "PMH holds and volume expands.",
      "No lower high.",
      "VWAP remains support.",
      "Spread/borrow risk is unacceptable.",
    ],
    checklist: [
      "Gap up with attention.",
      "Weak continuation.",
      "PMH/Golden Zone/VWAP rejection.",
      "Lower high.",
      "Clear stop.",
      "RR is clean.",
    ],
    educationNote:
      "GapCrap Short is a fade of failed premarket hype. The best version appears when the gap cannot attract new buyers and early longs become trapped.",
    tags: ["gap_crap", "small_cap", "premarket", "short", "pmh", "vwap"],
  },
  {
    slug: "pmh_golden_zone_short",
    name: "PMH / Golden Zone Short",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "10m"],
    triggerTimeframe: "1m",
    confirmationTimeframe: "5m",
    confidenceBase: 76,
    minimumConfidenceForAlert: 86,
    description:
      "Liquidity trap short around premarket high or Golden Zone where breakout buyers are trapped and sellers defend above the level.",
    triggerConditions: [
      "Price approaches PMH or Golden Zone after premarket pump.",
      "Quick push above the level fails.",
      "Selling pressure appears above the level.",
      "Price returns below PMH/Golden Zone.",
    ],
    confirmationConditions: [
      "Stuff/rejection candle appears.",
      "Large selling prints or clear sell pressure if available.",
      "Failed retest from below improves quality.",
      "No clean hold above PMH.",
    ],
    entryLogic: [
      "Enter after reclaim back below PMH/Golden Zone.",
      "Enter on failed retest from below.",
    ],
    stopLogic: [
      "Stop above PMH/Golden Zone rejection high.",
      "Invalidate if level is reclaimed and held.",
    ],
    targetLogic: [
      "Target VWAP, premarket base, then lower liquidity.",
      "Cover partials into first flush.",
    ],
    riskWarnings: [
      "PMH traps can squeeze if buyers reclaim the level.",
      "Avoid if breakout above PMH holds with volume.",
    ],
    avoidIf: [
      "No rejection above PMH.",
      "No selling pressure.",
      "Price holds above Golden Zone.",
    ],
    checklist: [
      "PMH/Golden Zone identified.",
      "Push above failed.",
      "Back below level.",
      "Stop above rejection high.",
      "First target is realistic.",
    ],
    educationNote:
      "PMH / Golden Zone Short uses the premarket high as a liquidity trap. The signal is valid only after buyers fail above the level.",
    tags: ["pmh", "golden_zone", "liquidity_trap", "short"],
  },
  {
    slug: "catalyst_reaction_fade",
    name: "Catalyst Reaction Fade",
    family: "news_catalyst",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description:
      "Fade setup after any catalyst-driven gap/pump fails to continue.",
    triggerConditions: [
      "Ticker is in-play because of earnings.",
      "Initial reaction creates gap/pump.",
      "New highs fail or continuation stalls.",
      "VWAP or opening structure is lost.",
    ],
    confirmationConditions: [
      "Volume no longer supports new highs.",
      "Failed reclaim of VWAP or opening range.",
      "Lower high forms after initial reaction.",
    ],
    entryLogic: [
      "Enter after failed reclaim or lower high.",
      "Avoid shorting the first earnings candle without structure.",
    ],
    stopLogic: [
      "Stop above lower high or failed reclaim high.",
      "Invalidate if earnings move reclaims VWAP/opening range with volume.",
    ],
    targetLogic: [
      "Target opening range low, VWAP/base, then daily support.",
      "Cover faster if earnings name remains highly volatile.",
    ],
    riskWarnings: [
      "Earnings names can reverse sharply both ways.",
      "Avoid if guidance/call creates fresh buying pressure.",
    ],
    avoidIf: [
      "VWAP reclaimed and held.",
      "Continuation volume returns.",
      "No lower high or structure break.",
    ],
    checklist: [
      "Earnings catalyst.",
      "Reaction failed.",
      "VWAP/opening structure lost.",
      "Lower high confirmed.",
      "Risk is defined.",
    ],
    educationNote:
      "Earnings Reaction Fade works when the first emotional move cannot attract continuation and price confirms a shift from reaction to distribution.",
    tags: ["earnings", "fade", "vwap", "short", "in_play"],
  },
  {
    slug: "catalyst_continuation_after_pullback",
    name: "Catalyst Continuation After Pullback",
    family: "news_catalyst",
    marketTypes: ["stocks"],
    direction: "long",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 83,
    description:
      "Continuation setup after a catalyst-driven move where first pullback holds, VWAP/opening range is defended and volume confirms continuation.",
    triggerConditions: [
      "Ticker is in-play because of earnings.",
      "Gap/initial reaction is strong.",
      "First pullback is controlled.",
      "VWAP or opening range holds.",
    ],
    confirmationConditions: [
      "Higher low after pullback.",
      "Volume improves on continuation.",
      "Price reclaims/holds key level.",
      "Broad market does not strongly reject.",
    ],
    entryLogic: [
      "Enter after pullback hold and continuation break.",
      "Enter on VWAP reclaim/hold if risk is tight.",
    ],
    stopLogic: [
      "Stop below pullback low or VWAP hold low.",
      "Invalidate if opening structure is lost.",
    ],
    targetLogic: [
      "Target premarket high/day high first.",
      "Second target at daily resistance or measured move.",
    ],
    riskWarnings: [
      "Earnings continuation fails if volume fades.",
      "Avoid chasing after extended second impulse.",
    ],
    avoidIf: [
      "First pullback breaks structure.",
      "VWAP lost with volume.",
      "No continuation volume.",
    ],
    checklist: [
      "Earnings catalyst.",
      "Strong reaction.",
      "Pullback controlled.",
      "VWAP/opening range held.",
      "Continuation confirmed.",
    ],
    educationNote:
      "Earnings continuation is strongest when the first pullback proves buyers still control the post-earnings reaction.",
    tags: ["earnings", "continuation", "pullback", "long"],
  },
  {
    slug: "intraday_vwap_trend_continuation",
    name: "Intraday VWAP Trend Continuation",
    family: "vwap",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 68,
    minimumConfidenceForAlert: 82,
    description:
      "Main-session day trade where price trends, pulls back to VWAP or dynamic mean, holds, and resumes the trend.",
    triggerConditions: [
      "Clear intraday trend exists after market open.",
      "Pullback into VWAP/mean is controlled.",
      "VWAP holds as support for long or resistance for short.",
      "Continuation candle appears from the VWAP zone.",
    ],
    confirmationConditions: [
      "Impulse volume is stronger than pullback volume.",
      "Structure remains intact.",
      "No major market reversal against direction.",
    ],
    entryLogic: [
      "Enter on VWAP hold/rejection after pullback.",
      "Enter on micro break in trend direction after hold.",
    ],
    stopLogic: [
      "Stop behind VWAP hold/rejection structure.",
      "Invalidate if VWAP is lost/reclaimed against the idea.",
    ],
    targetLogic: [
      "Target prior trend extreme.",
      "Second target at extension or liquidity pool.",
    ],
    riskWarnings: [
      "Trend continuation fails if pullback becomes reversal.",
      "Avoid late entries far from VWAP.",
    ],
    avoidIf: [
      "Trend is unclear.",
      "VWAP does not hold.",
      "Market index reverses aggressively.",
    ],
    checklist: [
      "Trend exists.",
      "VWAP pullback controlled.",
      "Hold/rejection confirmed.",
      "Risk close to VWAP.",
      "Room to target exists.",
    ],
    educationNote:
      "This is a day-session continuation setup. It is designed for 17:30–20:30 Kyiv when the open noise has settled and trend structure is clearer.",
    tags: ["day_session", "vwap", "trend", "continuation"],
  },
  {
    slug: "midday_range_breakout_continuation",
    name: "Midday Range Breakout Continuation",
    family: "opening_range",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["5m", "15m", "30m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 66,
    minimumConfidenceForAlert: 82,
    description:
      "Main-session setup where price compresses after the open, builds a clean range and breaks out with renewed volume.",
    triggerConditions: [
      "Opening volatility has cooled.",
      "Clean intraday range has formed.",
      "Price compresses near range edge.",
      "Breakout occurs with renewed volume.",
    ],
    confirmationConditions: [
      "Breakout candle closes outside range.",
      "Retest holds outside the range.",
      "Volume expands versus midday baseline.",
    ],
    entryLogic: [
      "Enter on breakout plus hold.",
      "Better entry is retest hold outside range.",
    ],
    stopLogic: [
      "Stop back inside the range.",
      "Invalidate if breakout fails and returns to range midpoint.",
    ],
    targetLogic: [
      "Target measured range extension.",
      "Use prior high/low and liquidity zones as targets.",
    ],
    riskWarnings: [
      "Midday breakouts fail often without volume.",
      "Avoid if range is too messy.",
    ],
    avoidIf: [
      "No renewed volume.",
      "Range boundaries are unclear.",
      "Breakout immediately returns inside range.",
    ],
    checklist: [
      "Range formed.",
      "Compression near edge.",
      "Breakout with volume.",
      "Hold/retest confirmed.",
      "Stop is inside range.",
    ],
    educationNote:
      "Midday Range Breakout is for the quieter part of the session. The edge comes when compression resolves with real volume, not random chop.",
    tags: ["day_session", "range", "breakout", "continuation"],
  },
  {
    slug: "power_hour_breakout_continuation",
    name: "Power Hour Breakout Continuation",
    family: "momentum",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["5m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 67,
    minimumConfidenceForAlert: 83,
    description:
      "Late-session continuation setup where price holds trend/range structure and breaks toward closing liquidity with volume.",
    triggerConditions: [
      "Setup appears in the last 90 minutes before US close.",
      "Ticker remains in-play with volume.",
      "Price holds trend or range edge.",
      "Breakout/continuation appears with renewed closing activity.",
    ],
    confirmationConditions: [
      "No failed breakout immediately after trigger.",
      "Volume increases into the move.",
      "Market index does not sharply reverse.",
    ],
    entryLogic: [
      "Enter on breakout plus hold.",
      "Enter on pullback that holds the breakout level.",
    ],
    stopLogic: [
      "Stop back inside late-day range.",
      "Invalidate if breakout fails with strong opposite candle.",
    ],
    targetLogic: [
      "Target day high/low or closing liquidity.",
      "Take partials faster because time remaining is limited.",
    ],
    riskWarnings: [
      "Late-day reversals can be sharp.",
      "Avoid if spread widens or liquidity disappears.",
    ],
    avoidIf: [
      "No volume into power hour.",
      "Breakout instantly fails.",
      "Market index reverses hard.",
    ],
    checklist: [
      "Late session.",
      "Ticker still in-play.",
      "Breakout with volume.",
      "Hold confirmed.",
      "Time to target is realistic.",
    ],
    educationNote:
      "Power Hour continuation is a late-day momentum setup. It requires active volume and fast management because the session is close to ending.",
    tags: ["power_hour", "day_session", "momentum", "breakout"],
  },
  {
    slug: "late_day_failed_breakout_reversal",
    name: "Late-Day Failed Breakout Reversal",
    family: "failed_breakout",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["5m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 69,
    minimumConfidenceForAlert: 83,
    description:
      "Late-session trap setup where price breaks day high/low or range edge, fails, and reverses as trapped traders exit before close.",
    triggerConditions: [
      "Late-session breakout/breakdown occurs.",
      "Move fails to sustain beyond the level.",
      "Price returns back inside the range.",
      "Opposite volume appears after failure.",
    ],
    confirmationConditions: [
      "Failed retest improves quality.",
      "Trapped breakout/breakdown traders are obvious.",
      "Time remaining allows realistic target.",
    ],
    entryLogic: [
      "Short after failed breakout back under level.",
      "Long after failed breakdown back above level.",
      "Prefer retest failure/hold for cleaner risk.",
    ],
    stopLogic: [
      "Stop beyond failed breakout/breakdown extreme.",
      "Invalidate if price reclaims the breakout direction again.",
    ],
    targetLogic: [
      "Target range midpoint first.",
      "Second target at opposite range edge if reversal accelerates.",
    ],
    riskWarnings: [
      "Late-day traps need quick confirmation.",
      "Avoid if time remaining is too short for target.",
    ],
    avoidIf: [
      "Breakout holds.",
      "No opposite volume.",
      "Stop is too wide for late session.",
    ],
    checklist: [
      "Late-session level break.",
      "Break failed.",
      "Back inside range.",
      "Opposite pressure confirmed.",
      "Stop beyond trap extreme.",
    ],
    educationNote:
      "Late-Day Failed Breakout Reversal works when a closing breakout traps late traders and price returns back into the range.",
    tags: ["power_hour", "failed_breakout", "trap", "reversal"],
  },
  {
    slug: "personal_premarket_short_fingerprint",
    name: "Personal Premarket Short Fingerprint",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 78,
    minimumConfidenceForAlert: 88,
    description:
      "Personalized premarket short pattern based on repeated profitable examples: gap/pump, failed high, lower high, VWAP/key level rejection and controlled RR.",
    triggerConditions: [
      "Signal appears during active premarket window from 13:00 Kyiv or later.",
      "Stock is in-play with gap/pump and abnormal volume.",
      "First continuation attempt fails.",
      "Lower high forms near VWAP/PMH/key level.",
      "Breakdown confirms after the failed push.",
    ],
    confirmationConditions: [
      "Entry is not a blind top-tick.",
      "Stop can be placed above failed high/lower high.",
      "Target room to VWAP/base/support is at least acceptable.",
      "Spread/liquidity/borrow risk does not invalidate the trade.",
    ],
    entryLogic: [
      "Best entry: lower high under VWAP or failed PMH retest.",
      "Secondary entry: breakdown after failed push with close stop.",
      "Avoid chasing after the first large red candle if RR is gone.",
    ],
    stopLogic: [
      "Stop above lower high or failed PMH/VWAP rejection high.",
      "Invalidate on VWAP reclaim or new high with strong volume.",
    ],
    targetLogic: [
      "Target VWAP/base/support depending on entry location.",
      "Use partial covers into first flush.",
      "Hold runner only if selling pressure continues.",
    ],
    riskWarnings: [
      "This setup must stay selective.",
      "Do not trade if RR is poor.",
      "Do not trade if short thesis depends only on price being high.",
      "Low float/halt risk must reduce size and confidence.",
    ],
    avoidIf: [
      "No failed high.",
      "No lower high.",
      "VWAP holds as support.",
      "Spread is too wide.",
      "Fresh catalyst restarts upside volume.",
    ],
    checklist: [
      "Premarket in-play ticker.",
      "Gap/pump with volume.",
      "Failed high.",
      "Lower high / VWAP rejection.",
      "Breakdown confirmation.",
      "RR at least 2:1.",
    ],
    educationNote:
      "This is the user-style premarket short fingerprint. It should be used as a premium alert only when structure, timing and RR are all aligned.",
    tags: ["personal_fingerprint", "premarket", "short", "user_style", "high_confidence"],
  },

    {
    slug: "vwap_jline_rejection_short",
    name: "VWAP + J-Line Rejection Short",
    family: "vwap",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "10m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 75,
    minimumConfidenceForAlert: 86,
    description:
      "Short setup where a premarket/intraday pump fails near VWAP or J-Line style dynamic resistance, forms rejection and resumes downside.",
    triggerConditions: [
      "Ticker is in-play with abnormal movement and volume.",
      "Price is below or losing VWAP/dynamic mean.",
      "Bounce into VWAP/J-Line style resistance fails.",
      "Lower high or rejection candle forms near resistance.",
      "Breakdown starts after failed reclaim.",
    ],
    confirmationConditions: [
      "VWAP is not reclaimed.",
      "Bounce volume is weaker than prior sell pressure.",
      "Selling expands after rejection.",
      "Stop above rejection high is clear.",
    ],
    entryLogic: [
      "Enter on rejection from VWAP/dynamic resistance.",
      "Enter on breakdown after lower high under VWAP.",
      "Avoid chasing after the first large red candle if RR is gone.",
    ],
    stopLogic: [
      "Stop above rejection high or VWAP reclaim level.",
      "Invalidate if price reclaims VWAP and holds above it.",
    ],
    targetLogic: [
      "First target at prior intraday low or premarket base.",
      "Second target at liquidity below lows.",
      "Cover faster if selling volume fades.",
    ],
    riskWarnings: [
      "VWAP reclaim can squeeze shorts.",
      "Avoid if rejection has no selling volume.",
      "Avoid if spread/borrow/liquidity risk is unacceptable.",
    ],
    avoidIf: [
      "VWAP is reclaimed and held.",
      "No lower high.",
      "No selling confirmation.",
      "Move is already too extended below VWAP.",
    ],
    checklist: [
      "In-play ticker.",
      "VWAP/dynamic resistance identified.",
      "Bounce failed.",
      "Lower high/rejection confirmed.",
      "Breakdown has volume.",
      "RR is at least 2:1.",
    ],
    educationNote:
      "VWAP + J-Line rejection short works when average price becomes resistance and buyers fail to regain control. The setup is strongest after rejection and breakdown, not before confirmation.",
    tags: ["vwap", "jline", "rejection", "short", "premarket", "day_trading"],
  },
  {
    slug: "wall_of_sellers_short",
    name: "Wall of Sellers Short",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "10m"],
    triggerTimeframe: "1m",
    confirmationTimeframe: "5m",
    confidenceBase: 74,
    minimumConfidenceForAlert: 86,
    description:
      "Short setup where price pushes into a visible resistance/liquidity zone and repeatedly fails because sellers defend the area.",
    triggerConditions: [
      "Ticker is extended or approaching visible resistance.",
      "Multiple attempts to lift through the zone fail.",
      "Price cannot hold above the resistance area.",
      "Selling pressure appears on each push.",
      "Micro-structure starts forming lower highs.",
    ],
    confirmationConditions: [
      "Failed push above resistance.",
      "Return below the seller zone.",
      "Lower high after rejection.",
      "Breakdown below micro support.",
    ],
    entryLogic: [
      "Enter after sellers defend the zone and price returns below resistance.",
      "Higher quality entry comes after lower high or failed retest.",
    ],
    stopLogic: [
      "Stop above seller wall/rejection high.",
      "Invalidate if resistance is reclaimed and held with volume.",
    ],
    targetLogic: [
      "First target at VWAP or prior base.",
      "Second target at premarket support or range low.",
    ],
    riskWarnings: [
      "Seller wall can break and squeeze if real demand appears.",
      "Avoid if resistance is absorbed and price holds above it.",
    ],
    avoidIf: [
      "Resistance is cleanly reclaimed.",
      "Buy volume increases into the wall.",
      "No rejection or lower high.",
      "RR is weak.",
    ],
    checklist: [
      "Visible seller zone.",
      "Multiple failed pushes.",
      "Back below resistance.",
      "Lower high or breakdown.",
      "Stop above wall.",
      "Target room exists.",
    ],
    educationNote:
      "Wall of Sellers Short is not just a resistance touch. The signal appears when sellers repeatedly defend the zone and buyers fail to absorb supply.",
    tags: ["seller_wall", "resistance", "short", "small_cap", "trap"],
  },
  {
    slug: "second_day_fade_continuation",
    name: "Second Day Fade / Continuation-Fade",
    family: "small_cap_pump_dump",
    marketTypes: ["stocks"],
    direction: "short",
    primaryTimeframes: ["5m", "15m", "1D"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 71,
    minimumConfidenceForAlert: 84,
    description:
      "Second-day setup after a prior runner loses continuation, fails to reclaim key levels and starts fading as momentum buyers exit.",
    triggerConditions: [
      "Stock was a strong runner on the prior session.",
      "Second day opens with attention but weaker continuation.",
      "Price fails to reclaim day-one high, PMH, VWAP or opening range.",
      "Lower high forms after first attempt.",
      "Volume no longer supports continuation.",
    ],
    confirmationConditions: [
      "VWAP/opening structure is lost or rejected.",
      "Failed reclaim appears.",
      "Selling pressure increases after lower high.",
      "Daily chart is extended or has overhead resistance.",
    ],
    entryLogic: [
      "Enter after failed reclaim and lower high.",
      "Enter on VWAP rejection or opening range breakdown.",
      "Avoid guessing the top before second-day weakness confirms.",
    ],
    stopLogic: [
      "Stop above lower high or failed reclaim high.",
      "Invalidate if price reclaims VWAP/opening range with volume.",
    ],
    targetLogic: [
      "First target at intraday low.",
      "Second target at prior support/base.",
      "Cover into sharp flushes if liquidity dries.",
    ],
    riskWarnings: [
      "Second-day runners can squeeze again if volume returns.",
      "Avoid if fresh catalyst renews upside attention.",
    ],
    avoidIf: [
      "Clean continuation above prior highs.",
      "VWAP holds as support.",
      "No lower high.",
      "Volume expands upward again.",
    ],
    checklist: [
      "Prior day runner.",
      "Second-day continuation weakens.",
      "Failed reclaim/VWAP rejection.",
      "Lower high.",
      "Breakdown confirms.",
      "RR is acceptable.",
    ],
    educationNote:
      "Second Day Fade is a continuation-failure setup. The best version appears when day-one momentum cannot attract new buyers and trapped longs begin to exit.",
    tags: ["second_day", "runner", "fade", "short", "small_cap"],
  },
  {
    slug: "big_cap_catalyst_continuation",
    name: "Big Cap Catalyst Continuation",
    family: "news_catalyst",
    marketTypes: ["stocks"],
    direction: "both",
    primaryTimeframes: ["5m", "10m", "15m", "30m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "10m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 83,
    description:
      "Big-cap catalyst setup where post-earnings reaction builds structure, holds VWAP/opening range and continues with institutional-style volume.",
    triggerConditions: [
      "Large-cap ticker is in-play because of earnings or guidance.",
      "Initial move has real volume and liquidity.",
      "Price builds structure after the first emotional reaction.",
      "VWAP/opening range/daily level is respected.",
      "Continuation or fade confirms through structure.",
    ],
    confirmationConditions: [
      "For long: pullback holds VWAP/opening range and forms higher low.",
      "For short: failed reclaim/VWAP rejection and lower high appear.",
      "Volume supports the direction.",
      "Broad market/sector context does not strongly fight the trade.",
    ],
    entryLogic: [
      "Long: enter after pullback hold and continuation break.",
      "Short: enter after failed reclaim or VWAP rejection.",
      "Do not enter the first emotional earnings candle without structure.",
    ],
    stopLogic: [
      "Stop beyond pullback low, failed reclaim high or opening range level.",
      "Invalidate if post-earnings structure breaks against the idea.",
    ],
    targetLogic: [
      "Target day high/low, premarket level or daily liquidity.",
      "Use partials because earnings volatility can reverse fast.",
    ],
    riskWarnings: [
      "Earnings reactions can change after guidance/call commentary.",
      "Market/sector context matters more on big caps.",
      "Avoid poor RR after the second or third extension candle.",
    ],
    avoidIf: [
      "No structure after earnings reaction.",
      "Volume fades completely.",
      "Broad market reverses aggressively against direction.",
      "Entry is too far from invalidation.",
    ],
    checklist: [
      "Earnings catalyst.",
      "Liquid big-cap ticker.",
      "Structure formed after initial reaction.",
      "VWAP/opening range confirms direction.",
      "RR is at least 2:1.",
    ],
    educationNote:
      "Big Cap Earnings Continuation is about trading the structured reaction after earnings, not guessing the first spike. The best entries come after VWAP/opening range proves control.",
    tags: ["big_cap", "earnings", "continuation", "vwap", "day_trading"],
  },

    {
    slug: "crypto_stop_run_reclaim_long",
    name: "Crypto Stop Run + Reclaim Long",
    family: "liquidity_smart_money",
    marketTypes: ["crypto"],
    direction: "long",
    primaryTimeframes: ["1m", "5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 74,
    minimumConfidenceForAlert: 85,
    description:
      "Crypto manipulation setup where price sweeps sell-side liquidity below a visible low, fails to continue lower, reclaims the level and starts a reversal.",
    triggerConditions: [
      "Visible sell-side liquidity exists below prior low or equal lows.",
      "Price aggressively sweeps below the liquidity level.",
      "Breakdown fails to continue after the stop run.",
      "Price reclaims the swept level.",
      "Reclaim happens with displacement or clear buyer response.",
    ],
    confirmationConditions: [
      "Reclaim candle closes back above the swept level.",
      "Higher low forms after reclaim.",
      "BTC or broader crypto context stops fighting the trade.",
      "Entry remains close to invalidation.",
    ],
    entryLogic: [
      "Enter after reclaim and hold above swept low.",
      "Higher quality entry comes on pullback after reclaim if stop remains tight.",
    ],
    stopLogic: [
      "Stop below sweep low.",
      "Invalidate if price accepts back below the swept level.",
    ],
    targetLogic: [
      "First target at range midpoint.",
      "Second target at buy-side liquidity above recent highs.",
      "Scale if price reaches premium area of the range.",
    ],
    riskWarnings: [
      "Do not buy the sweep before reclaim.",
      "If BTC keeps dumping, reversal quality drops.",
      "Crypto stop runs can continue into liquidation cascades.",
    ],
    avoidIf: [
      "No reclaim after sweep.",
      "No higher low after reclaim.",
      "Entry is far from sweep low.",
      "BTC continues aggressive downside.",
    ],
    checklist: [
      "Sell-side liquidity swept.",
      "Reclaim confirmed.",
      "Higher low formed.",
      "Stop below sweep.",
      "Target liquidity exists.",
      "RR is at least 2:1.",
    ],
    educationNote:
      "This is a liquidity manipulation setup. The trade is not the sweep itself; the trade starts after the market proves the breakdown failed and reclaims the level.",
    tags: ["crypto", "liquidity_sweep", "stop_run", "reclaim", "smart_money"],
  },
  {
    slug: "crypto_stop_run_rejection_short",
    name: "Crypto Stop Run + Rejection Short",
    family: "liquidity_smart_money",
    marketTypes: ["crypto"],
    direction: "short",
    primaryTimeframes: ["1m", "5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 74,
    minimumConfidenceForAlert: 85,
    description:
      "Crypto manipulation setup where price sweeps buy-side liquidity above a visible high, fails to hold and rejects back below the swept level.",
    triggerConditions: [
      "Visible buy-side liquidity exists above prior high or equal highs.",
      "Price aggressively sweeps above the liquidity level.",
      "Breakout fails to continue after the stop run.",
      "Price rejects back below the swept high.",
      "Rejection happens with displacement or clear seller response.",
    ],
    confirmationConditions: [
      "Rejection candle closes back below the swept level.",
      "Lower high forms after rejection.",
      "BTC or broader crypto context does not fight the short.",
      "Entry remains close to invalidation.",
    ],
    entryLogic: [
      "Enter after rejection back below swept high.",
      "Higher quality entry comes on failed retest from below.",
    ],
    stopLogic: [
      "Stop above sweep high.",
      "Invalidate if price reclaims and holds above the swept high.",
    ],
    targetLogic: [
      "First target at range midpoint.",
      "Second target at sell-side liquidity below recent lows.",
      "Scale if price reaches discount area of the range.",
    ],
    riskWarnings: [
      "Do not short the sweep before rejection.",
      "Crypto squeezes can continue violently if breakout holds.",
      "Avoid if funding/liquidation context supports more upside.",
    ],
    avoidIf: [
      "No rejection after sweep.",
      "No lower high after rejection.",
      "Entry is far from sweep high.",
      "BTC continues aggressive upside.",
    ],
    checklist: [
      "Buy-side liquidity swept.",
      "Rejection confirmed.",
      "Lower high formed.",
      "Stop above sweep.",
      "Target liquidity exists.",
      "RR is at least 2:1.",
    ],
    educationNote:
      "This setup catches failed liquidity grabs above highs. The signal is valid only after price rejects and traps breakout buyers.",
    tags: ["crypto", "liquidity_sweep", "stop_run", "rejection", "smart_money"],
  },
  {
    slug: "order_block_mitigation_reaction",
    name: "Order Block / Mitigation Reaction",
    family: "liquidity_smart_money",
    marketTypes: ["stocks", "crypto", "futures", "forex"],
    direction: "both",
    primaryTimeframes: ["5m", "15m", "1h", "4h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 83,
    description:
      "Smart money setup where price returns to a prior displacement origin / order block area, reacts and resumes in the direction of the structure.",
    triggerConditions: [
      "Prior displacement created a clear impulse.",
      "Origin zone / order block area is identifiable.",
      "Price returns into the zone without fully invalidating structure.",
      "Reaction appears from the zone.",
      "Micro structure shifts back in the intended direction.",
    ],
    confirmationConditions: [
      "Zone reaction is visible on trigger timeframe.",
      "Displacement direction remains valid.",
      "Entry is close to invalidation.",
      "Target liquidity exists in the direction of the trade.",
    ],
    entryLogic: [
      "Enter after reaction from the order block/mitigation zone.",
      "Prefer entry after micro BOS/CHOCH in the trade direction.",
    ],
    stopLogic: [
      "Stop beyond the mitigation zone.",
      "Invalidate if price accepts through the zone and structure breaks.",
    ],
    targetLogic: [
      "Target nearest external liquidity.",
      "Second target at prior swing high/low or range liquidity.",
    ],
    riskWarnings: [
      "Not every order block is tradable.",
      "Without displacement and reaction, the zone is weak.",
      "Avoid if entry is far from the zone.",
    ],
    avoidIf: [
      "No prior displacement.",
      "No reaction from zone.",
      "Zone is already violated.",
      "RR is below premium standard.",
    ],
    checklist: [
      "Displacement exists.",
      "Mitigation zone identified.",
      "Price returns into zone.",
      "Reaction confirmed.",
      "Invalidation is clear.",
      "Liquidity target exists.",
    ],
    educationNote:
      "Order block / mitigation reaction is a structure-based setup. The zone matters only if it created displacement and price reacts when returning to it.",
    tags: ["order_block", "mitigation", "smart_money", "structure"],
  },
  {
    slug: "breaker_block_retest",
    name: "Breaker Block Retest",
    family: "liquidity_smart_money",
    marketTypes: ["stocks", "crypto", "futures", "forex"],
    direction: "both",
    primaryTimeframes: ["5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 70,
    minimumConfidenceForAlert: 83,
    description:
      "Smart money setup where a failed order block or broken structure flips role and acts as a retest zone for continuation.",
    triggerConditions: [
      "Prior support/resistance or order block fails.",
      "Structure breaks through the zone with displacement.",
      "Price retests the broken zone.",
      "Retest holds as new resistance for short or support for long.",
    ],
    confirmationConditions: [
      "Retest produces rejection/hold.",
      "Micro structure resumes in breakout direction.",
      "Volume or momentum supports continuation.",
      "Invalidation is close.",
    ],
    entryLogic: [
      "Enter after retest reaction from breaker zone.",
      "Prefer entry after micro confirmation candle.",
    ],
    stopLogic: [
      "Stop beyond the breaker retest zone.",
      "Invalidate if price accepts back through the breaker.",
    ],
    targetLogic: [
      "Target next liquidity pool in trend direction.",
      "Use prior swing high/low as partial target.",
    ],
    riskWarnings: [
      "Breaker retest fails if price accepts back into old range.",
      "Avoid if displacement through the zone was weak.",
    ],
    avoidIf: [
      "No displacement through zone.",
      "Retest does not react.",
      "Invalidation is too wide.",
      "Target room is limited.",
    ],
    checklist: [
      "Zone broke with displacement.",
      "Retest happened.",
      "Reaction confirmed.",
      "Stop behind breaker.",
      "Continuation target exists.",
    ],
    educationNote:
      "Breaker block retest uses failed structure as a new decision zone. It is strongest when the break was impulsive and the retest is controlled.",
    tags: ["breaker", "retest", "smart_money", "continuation"],
  },
  {
    slug: "fvg_fill_continuation",
    name: "FVG Fill + Continuation",
    family: "liquidity_smart_money",
    marketTypes: ["stocks", "crypto", "futures", "forex"],
    direction: "both",
    primaryTimeframes: ["1m", "5m", "15m", "1h"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 69,
    minimumConfidenceForAlert: 83,
    description:
      "Imbalance setup where price returns into a fair value gap / inefficiency after displacement, reacts and continues toward liquidity.",
    triggerConditions: [
      "Strong displacement creates a visible imbalance/FVG.",
      "Structure remains aligned with displacement.",
      "Price pulls back into the imbalance.",
      "Reaction appears before the imbalance is fully invalidated.",
    ],
    confirmationConditions: [
      "Micro structure turns back in the displacement direction.",
      "Entry is inside or near the FVG reaction area.",
      "Liquidity target exists beyond recent swing.",
    ],
    entryLogic: [
      "Enter after reaction from FVG fill area.",
      "Prefer entry after micro confirmation in the direction of displacement.",
    ],
    stopLogic: [
      "Stop beyond the FVG/POI reaction zone.",
      "Invalidate if price accepts through the imbalance and breaks structure.",
    ],
    targetLogic: [
      "Target external liquidity in the displacement direction.",
      "Partial at prior swing high/low.",
    ],
    riskWarnings: [
      "FVG alone is not a signal.",
      "Avoid if structure breaks before entry.",
      "Avoid if price fully accepts through the imbalance.",
    ],
    avoidIf: [
      "No displacement.",
      "No reaction from FVG.",
      "Entry too far from invalidation.",
      "RR below premium standard.",
    ],
    checklist: [
      "Displacement created FVG.",
      "Pullback entered imbalance.",
      "Reaction confirmed.",
      "Structure intact.",
      "Liquidity target exists.",
    ],
    educationNote:
      "FVG Fill + Continuation uses imbalance as a pullback area after displacement. The signal requires reaction and structure confirmation.",
    tags: ["fvg", "imbalance", "displacement", "smart_money"],
  },
  {
    slug: "session_liquidity_sweep_reversal",
    name: "Session Liquidity Sweep Reversal",
    family: "liquidity_smart_money",
    marketTypes: ["stocks", "crypto", "futures", "forex"],
    direction: "both",
    primaryTimeframes: ["1m", "5m", "15m"],
    triggerTimeframe: "5m",
    confirmationTimeframe: "15m",
    confidenceBase: 72,
    minimumConfidenceForAlert: 84,
    description:
      "Intraday manipulation setup where price sweeps session high/low liquidity, fails to continue and reverses back into the session range.",
    triggerConditions: [
      "Session high/low or equal highs/lows are clearly visible.",
      "Price sweeps the liquidity level.",
      "Break fails to sustain.",
      "Price returns back inside the session range.",
      "Opposite displacement or structure shift appears.",
    ],
    confirmationConditions: [
      "Reclaim/rejection after sweep is confirmed.",
      "Micro BOS/CHOCH appears after the sweep.",
      "Entry remains close to the sweep extreme.",
      "Target is range midpoint or opposite liquidity.",
    ],
    entryLogic: [
      "Long after sell-side sweep and reclaim.",
      "Short after buy-side sweep and rejection.",
      "Prefer entry after micro structure shift.",
    ],
    stopLogic: [
      "Stop beyond sweep extreme.",
      "Invalidate if price accepts beyond the swept level.",
    ],
    targetLogic: [
      "Target session range midpoint.",
      "Second target at opposite session liquidity.",
    ],
    riskWarnings: [
      "A sweep without reclaim/rejection is not a reversal.",
      "Avoid if trend day continues strongly after the sweep.",
    ],
    avoidIf: [
      "No return inside range.",
      "No structure shift.",
      "Entry far from sweep extreme.",
      "RR is weak.",
    ],
    checklist: [
      "Session liquidity identified.",
      "Sweep happened.",
      "Back inside range.",
      "Structure shift confirmed.",
      "Stop beyond sweep.",
      "Target range midpoint/opposite side.",
    ],
    educationNote:
      "Session liquidity sweep reversal works when stops are run above/below session levels and price fails to accept outside the range.",
    tags: ["session_liquidity", "sweep", "reversal", "ict", "smart_money"],
  },
];

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
