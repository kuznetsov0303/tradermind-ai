import type { SkillEdgeCandle } from "@/lib/trading/market-structure";

export type SkillEdgePatternDirection = "upside" | "downside";

export type SkillEdgeDetectedPattern = {
  name: string;
  slug: string;
  family: "candle" | "chart" | "volume" | "structure";
  direction: SkillEdgePatternDirection | "neutral";
  strength: number;
  note: string;
};

export type SkillEdgePriceActionPatternAnalysis = {
  candlePatterns: SkillEdgeDetectedPattern[];
  chartPatterns: SkillEdgeDetectedPattern[];
  volumePatterns: SkillEdgeDetectedPattern[];
  structurePatterns: SkillEdgeDetectedPattern[];
  bullishScore: number;
  bearishScore: number;
  directionAlignmentScore: number;
  candlePatternScore: number;
  chartPatternScore: number;
  volumePatternScore: number;
  scoreImpact: number;
  topPatternNames: string[];
  patternTags: string[];
  notes: string[];
  riskFlags: string[];
};

type NormalizedCandle = SkillEdgeCandle & {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestampMs: number;
  body: number;
  range: number;
  upperWick: number;
  lowerWick: number;
  bodyPercent: number;
  closePosition: number;
  isBullish: boolean;
  isBearish: boolean;
};

const EMPTY_ANALYSIS: SkillEdgePriceActionPatternAnalysis = {
  candlePatterns: [],
  chartPatterns: [],
  volumePatterns: [],
  structurePatterns: [],
  bullishScore: 50,
  bearishScore: 50,
  directionAlignmentScore: 50,
  candlePatternScore: 50,
  chartPatternScore: 50,
  volumePatternScore: 50,
  scoreImpact: 0,
  topPatternNames: [],
  patternTags: [],
  notes: ["Not enough candle data for pattern analysis."],
  riskFlags: ["Price-action pattern data is missing or incomplete."],
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeCandles(candles: SkillEdgeCandle[]): NormalizedCandle[] {
  return candles
    .map((candle) => {
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);
      const volume =
        typeof candle.volume === "number" && Number.isFinite(candle.volume)
          ? candle.volume
          : 0;
      const timestampMs =
        candle.timestamp instanceof Date
          ? candle.timestamp.getTime()
          : typeof candle.timestamp === "number"
            ? candle.timestamp
            : new Date(candle.timestamp).getTime();
      const range = Math.max(high - low, 0);
      const body = Math.abs(close - open);
      const upperWick = Math.max(high - Math.max(open, close), 0);
      const lowerWick = Math.max(Math.min(open, close) - low, 0);
      const bodyPercent = range > 0 ? body / range : 0;
      const closePosition = range > 0 ? (close - low) / range : 0.5;

      return {
        ...candle,
        open,
        high,
        low,
        close,
        volume,
        timestampMs,
        body,
        range,
        upperWick,
        lowerWick,
        bodyPercent,
        closePosition,
        isBullish: close > open,
        isBearish: close < open,
      };
    })
    .filter(
      (candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        Number.isFinite(candle.timestampMs) &&
        candle.high >= candle.low &&
        candle.range > 0
    )
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function pattern(input: SkillEdgeDetectedPattern) {
  return {
    ...input,
    strength: clamp(input.strength),
  };
}

function addDirectionalScore(
  scores: { bullish: number; bearish: number },
  detected: SkillEdgeDetectedPattern
) {
  const impact = Math.max(2, Math.round(detected.strength / 12));

  if (detected.direction === "upside") scores.bullish += impact;
  if (detected.direction === "downside") scores.bearish += impact;
}

function detectCandlePatterns(candles: NormalizedCandle[]) {
  const result: SkillEdgeDetectedPattern[] = [];
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const beforePrevious = candles[candles.length - 3];
  const recent = candles.slice(-8);
  const avgRange = average(candles.slice(-20, -1).map((candle) => candle.range)) || last.range;
  const avgVolume = average(candles.slice(-20, -1).map((candle) => candle.volume));

  if (previous) {
    const bullishEngulfing =
      previous.isBearish &&
      last.isBullish &&
      last.open <= previous.close &&
      last.close >= previous.open &&
      last.body > previous.body * 1.05;

    const bearishEngulfing =
      previous.isBullish &&
      last.isBearish &&
      last.open >= previous.close &&
      last.close <= previous.open &&
      last.body > previous.body * 1.05;

    if (bullishEngulfing) {
      result.push(
        pattern({
          name: "Bullish Engulfing",
          slug: "bullish_engulfing",
          family: "candle",
          direction: "upside",
          strength: 76,
          note: "Last candle engulfed the previous bearish body and closed with bullish control.",
        })
      );
    }

    if (bearishEngulfing) {
      result.push(
        pattern({
          name: "Bearish Engulfing",
          slug: "bearish_engulfing",
          family: "candle",
          direction: "downside",
          strength: 76,
          note: "Last candle engulfed the previous bullish body and closed with bearish control.",
        })
      );
    }

    const insideBar = last.high < previous.high && last.low > previous.low;

    if (insideBar) {
      result.push(
        pattern({
          name: "Inside Bar Compression",
          slug: "inside_bar_compression",
          family: "candle",
          direction: "neutral",
          strength: 64,
          note: "Last candle is inside the previous candle, showing compression before expansion.",
        })
      );
    }

    const outsideBar = last.high > previous.high && last.low < previous.low;

    if (outsideBar) {
      result.push(
        pattern({
          name: last.close >= last.open ? "Bullish Outside Bar" : "Bearish Outside Bar",
          slug: last.close >= last.open ? "bullish_outside_bar" : "bearish_outside_bar",
          family: "candle",
          direction: last.close >= last.open ? "upside" : "downside",
          strength: 70,
          note: "Outside candle expanded through both sides of the previous range.",
        })
      );
    }
  }

  const hammerLike =
    last.lowerWick >= last.body * 1.8 &&
    last.upperWick <= last.range * 0.3 &&
    last.closePosition >= 0.55;

  const shootingStarLike =
    last.upperWick >= last.body * 1.8 &&
    last.lowerWick <= last.range * 0.3 &&
    last.closePosition <= 0.45;

  if (hammerLike) {
    result.push(
      pattern({
        name: "Hammer / Demand Wick",
        slug: "hammer_demand_wick",
        family: "candle",
        direction: "upside",
        strength: 70,
        note: "Long lower wick shows sellers were absorbed and price closed away from the low.",
      })
    );
  }

  if (shootingStarLike) {
    result.push(
      pattern({
        name: "Shooting Star / Supply Wick",
        slug: "shooting_star_supply_wick",
        family: "candle",
        direction: "downside",
        strength: 70,
        note: "Long upper wick shows buyers were rejected and price closed away from the high.",
      })
    );
  }

  if (last.bodyPercent <= 0.18) {
    result.push(
      pattern({
        name: "Doji / Indecision Candle",
        slug: "doji_indecision",
        family: "candle",
        direction: "neutral",
        strength: 52,
        note: "Small body shows indecision; confirmation candle is required.",
      })
    );
  }

  if (last.bodyPercent >= 0.72 && last.range >= avgRange * 1.15) {
    result.push(
      pattern({
        name: last.isBullish ? "Bullish Displacement Candle" : "Bearish Displacement Candle",
        slug: last.isBullish ? "bullish_displacement_candle" : "bearish_displacement_candle",
        family: "candle",
        direction: last.isBullish ? "upside" : "downside",
        strength: 78,
        note: "Large body candle closed with control and expanded beyond normal range.",
      })
    );
  }

  if (beforePrevious) {
    const lastThree = [beforePrevious, previous, last];
    const threeBull = lastThree.every((candle) => candle.isBullish) && last.close > previous.close && previous.close > beforePrevious.close;
    const threeBear = lastThree.every((candle) => candle.isBearish) && last.close < previous.close && previous.close < beforePrevious.close;

    if (threeBull) {
      result.push(
        pattern({
          name: "Three-Candle Bullish Momentum",
          slug: "three_candle_bullish_momentum",
          family: "candle",
          direction: "upside",
          strength: 73,
          note: "Three consecutive bullish closes show short-term momentum continuation.",
        })
      );
    }

    if (threeBear) {
      result.push(
        pattern({
          name: "Three-Candle Bearish Momentum",
          slug: "three_candle_bearish_momentum",
          family: "candle",
          direction: "downside",
          strength: 73,
          note: "Three consecutive bearish closes show short-term downside momentum.",
        })
      );
    }
  }

  if (avgVolume > 0 && last.volume >= avgVolume * 1.8) {
    result.push(
      pattern({
        name: last.close >= last.open ? "Bullish Volume Expansion" : "Bearish Volume Expansion",
        slug: last.close >= last.open ? "bullish_volume_expansion" : "bearish_volume_expansion",
        family: "volume",
        direction: last.close >= last.open ? "upside" : "downside",
        strength: 74,
        note: "Last candle volume is materially above recent average.",
      })
    );
  }

  const recentRanges = recent.map((candle) => candle.range);
  const rangeCompression = recentRanges.length >= 6 && average(recentRanges.slice(-3)) < average(recentRanges.slice(0, 3)) * 0.72;

  if (rangeCompression) {
    result.push(
      pattern({
        name: "Range Compression",
        slug: "range_compression",
        family: "structure",
        direction: "neutral",
        strength: 63,
        note: "Recent candle ranges are compressing, often preceding expansion.",
      })
    );
  }

  return result;
}

function detectChartPatterns(candles: NormalizedCandle[]) {
  const result: SkillEdgeDetectedPattern[] = [];
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const recent20 = candles.slice(-20);
  const prior20 = candles.slice(-40, -20);
  const recent8 = candles.slice(-8);
  const previousRange = candles.slice(-31, -1);

  if (!previous || recent20.length < 12) return result;

  const recentHigh = Math.max(...recent20.slice(0, -1).map((candle) => candle.high));
  const recentLow = Math.min(...recent20.slice(0, -1).map((candle) => candle.low));
  const previousHigh = Math.max(...previousRange.map((candle) => candle.high));
  const previousLow = Math.min(...previousRange.map((candle) => candle.low));
  const avgVolume = average(candles.slice(-30, -1).map((candle) => candle.volume));
  const impulseUp = prior20.length > 0 && recent20[0].close > prior20[0].close * 1.025;
  const impulseDown = prior20.length > 0 && recent20[0].close < prior20[0].close * 0.975;
  const recentPullback = average(recent8.map((candle) => candle.close)) < Math.max(...recent20.map((candle) => candle.close)) * 0.985;
  const recentBounce = average(recent8.map((candle) => candle.close)) > Math.min(...recent20.map((candle) => candle.close)) * 1.015;

  if (last.close > recentHigh && last.volume >= avgVolume * 1.15) {
    result.push(
      pattern({
        name: "Breakout + Hold Attempt",
        slug: "breakout_hold_attempt",
        family: "chart",
        direction: "upside",
        strength: 78,
        note: "Price closed above recent resistance with volume support.",
      })
    );
  }

  if (last.close < recentLow && last.volume >= avgVolume * 1.15) {
    result.push(
      pattern({
        name: "Breakdown + Acceptance Attempt",
        slug: "breakdown_acceptance_attempt",
        family: "chart",
        direction: "downside",
        strength: 78,
        note: "Price closed below recent support with volume support.",
      })
    );
  }

  if (previous.high > previousHigh && last.close < previousHigh) {
    result.push(
      pattern({
        name: "Failed Breakout / Bull Trap",
        slug: "failed_breakout_bull_trap",
        family: "chart",
        direction: "downside",
        strength: 82,
        note: "Price swept above recent highs but failed back below the breakout level.",
      })
    );
  }

  if (previous.low < previousLow && last.close > previousLow) {
    result.push(
      pattern({
        name: "Failed Breakdown / Bear Trap",
        slug: "failed_breakdown_bear_trap",
        family: "chart",
        direction: "upside",
        strength: 82,
        note: "Price swept below recent lows but reclaimed back above the breakdown level.",
      })
    );
  }

  if (last.low < recentLow && last.close > recentLow && last.closePosition >= 0.55) {
    result.push(
      pattern({
        name: "Liquidity Sweep + Reclaim",
        slug: "liquidity_sweep_reclaim",
        family: "structure",
        direction: "upside",
        strength: 84,
        note: "Price swept sell-side liquidity and reclaimed the level.",
      })
    );
  }

  if (last.high > recentHigh && last.close < recentHigh && last.closePosition <= 0.45) {
    result.push(
      pattern({
        name: "Liquidity Sweep + Rejection",
        slug: "liquidity_sweep_rejection",
        family: "structure",
        direction: "downside",
        strength: 84,
        note: "Price swept buy-side liquidity and rejected back below the level.",
      })
    );
  }

  const lows = recent20.slice(-10).map((candle) => candle.low);
  const highs = recent20.slice(-10).map((candle) => candle.high);
  const higherLows = lows.length >= 5 && lows[lows.length - 1] > lows[0] && average(lows.slice(-3)) > average(lows.slice(0, 3));
  const lowerHighs = highs.length >= 5 && highs[highs.length - 1] < highs[0] && average(highs.slice(-3)) < average(highs.slice(0, 3));

  if (higherLows) {
    result.push(
      pattern({
        name: "Higher-Low Structure",
        slug: "higher_low_structure",
        family: "structure",
        direction: "upside",
        strength: 68,
        note: "Recent structure is building higher lows.",
      })
    );
  }

  if (lowerHighs) {
    result.push(
      pattern({
        name: "Lower-High Structure",
        slug: "lower_high_structure",
        family: "structure",
        direction: "downside",
        strength: 68,
        note: "Recent structure is building lower highs.",
      })
    );
  }

  if (impulseUp && recentPullback && last.close > previous.close) {
    result.push(
      pattern({
        name: "Bull Flag / Controlled Pullback",
        slug: "bull_flag_controlled_pullback",
        family: "chart",
        direction: "upside",
        strength: 74,
        note: "Impulse up was followed by controlled pullback and renewed upside attempt.",
      })
    );
  }

  if (impulseDown && recentBounce && last.close < previous.close) {
    result.push(
      pattern({
        name: "Bear Flag / Controlled Bounce",
        slug: "bear_flag_controlled_bounce",
        family: "chart",
        direction: "downside",
        strength: 74,
        note: "Impulse down was followed by controlled bounce and renewed downside attempt.",
      })
    );
  }

  const tolerance = Math.max(last.close * 0.0035, average(recent20.map((candle) => candle.range)) * 0.4);
  const topTouches = highs.filter((high) => Math.abs(high - recentHigh) <= tolerance).length;
  const bottomTouches = lows.filter((low) => Math.abs(low - recentLow) <= tolerance).length;

  if (topTouches >= 2 && last.close < previous.close) {
    result.push(
      pattern({
        name: "Double Top / Supply Test",
        slug: "double_top_supply_test",
        family: "chart",
        direction: "downside",
        strength: 66,
        note: "Price tested a similar high multiple times and started rejecting.",
      })
    );
  }

  if (bottomTouches >= 2 && last.close > previous.close) {
    result.push(
      pattern({
        name: "Double Bottom / Demand Test",
        slug: "double_bottom_demand_test",
        family: "chart",
        direction: "upside",
        strength: 66,
        note: "Price tested a similar low multiple times and started reclaiming.",
      })
    );
  }

  return result;
}

function scoreFamily(patterns: SkillEdgeDetectedPattern[]) {
  if (patterns.length === 0) return 50;

  const top = [...patterns]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);

  return clamp(50 + average(top.map((item) => item.strength - 50)));
}

export function analyzeSkillEdgePriceActionPatterns({
  candles,
  direction,
}: {
  candles?: SkillEdgeCandle[] | null;
  direction: SkillEdgePatternDirection;
}): SkillEdgePriceActionPatternAnalysis {
  const normalized = normalizeCandles(candles ?? []);

  if (normalized.length < 12) {
    return EMPTY_ANALYSIS;
  }

  const candleAndVolume = detectCandlePatterns(normalized);
  const chartAndStructure = detectChartPatterns(normalized);

  const candlePatterns = candleAndVolume.filter((item) => item.family === "candle");
  const volumePatterns = candleAndVolume.filter((item) => item.family === "volume");
  const structurePatterns = [
    ...candleAndVolume.filter((item) => item.family === "structure"),
    ...chartAndStructure.filter((item) => item.family === "structure"),
  ];
  const chartPatterns = chartAndStructure.filter((item) => item.family === "chart");
  const allPatterns = [
    ...candlePatterns,
    ...chartPatterns,
    ...volumePatterns,
    ...structurePatterns,
  ];

  const scores = { bullish: 50, bearish: 50 };
  allPatterns.forEach((item) => addDirectionalScore(scores, item));

  const bullishScore = clamp(scores.bullish);
  const bearishScore = clamp(scores.bearish);
  const directionalScore = direction === "upside" ? bullishScore : bearishScore;
  const oppositeScore = direction === "upside" ? bearishScore : bullishScore;
  const directionAlignmentScore = clamp(directionalScore - Math.max(0, oppositeScore - 55) * 0.5);

  const scoreImpact = clamp((directionAlignmentScore - 50) / 2, -20, 20);
  const topPatterns = [...allPatterns]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);

  const opposingPatterns = allPatterns.filter(
    (item) => item.direction !== "neutral" && item.direction !== direction && item.strength >= 72
  );

  return {
    candlePatterns,
    chartPatterns,
    volumePatterns,
    structurePatterns,
    bullishScore,
    bearishScore,
    directionAlignmentScore,
    candlePatternScore: scoreFamily(candlePatterns),
    chartPatternScore: scoreFamily(chartPatterns),
    volumePatternScore: scoreFamily(volumePatterns),
    scoreImpact,
    topPatternNames: topPatterns.map((item) => item.name),
    patternTags: topPatterns.map((item) => item.slug),
    notes: topPatterns.map((item) => item.note),
    riskFlags: opposingPatterns.map(
      (item) => `Opposing price-action pattern detected: ${item.name}.`
    ),
  };
}

