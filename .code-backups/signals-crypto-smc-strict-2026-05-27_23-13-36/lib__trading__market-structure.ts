export type SkillEdgeCandle = {
  timestamp: string | number | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type SkillEdgeStructureDirection = "upside" | "downside";

export type SkillEdgeStructureLevel = {
  price: number;
  label: string;
  type:
    | "vwap"
    | "swing_high"
    | "swing_low"
    | "day_high"
    | "day_low"
    | "premarket_high"
    | "premarket_low"
    | "range_midpoint"
    | "atr_projection";
};

export type SkillEdgeStructureTradePlan = {
  source: "structure" | "fallback";
  trigger_label: string;
  entry_zone_min: number | null;
  entry_zone_max: number | null;
  stop_price: number | null;
  target_1: number | null;
  target_2: number | null;
  target_3: number | null;
  invalidation: string;
  management_plan: string;
  risk_reward_ratio: number | null;
  vwap: number | null;
  atr: number | null;
  nearest_support: SkillEdgeStructureLevel | null;
  nearest_resistance: SkillEdgeStructureLevel | null;
  structure_notes: string[];
  missing_structure_data: string[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace("%", "").replace(",", "."));

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function roundPrice(price: number | null, decimals = 4) {
  if (price === null || !Number.isFinite(price)) return null;

  const multiplier = 10 ** decimals;
  return Math.round(price * multiplier) / multiplier;
}

function normalizeCandles(candles: SkillEdgeCandle[]) {
  return candles
    .map((candle) => ({
      ...candle,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume:
        typeof candle.volume === "number" && Number.isFinite(candle.volume)
          ? candle.volume
          : 0,
      timestampMs:
        candle.timestamp instanceof Date
          ? candle.timestamp.getTime()
          : typeof candle.timestamp === "number"
            ? candle.timestamp
            : new Date(candle.timestamp).getTime(),
    }))
    .filter(
      (candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= candle.low &&
        Number.isFinite(candle.timestampMs)
    )
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function calculateSkillEdgeVWAP(candles: SkillEdgeCandle[]) {
  const normalized = normalizeCandles(candles);

  let pv = 0;
  let volume = 0;

  for (const candle of normalized) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const candleVolume = candle.volume || 0;

    if (candleVolume <= 0) continue;

    pv += typicalPrice * candleVolume;
    volume += candleVolume;
  }

  if (volume <= 0) return null;

  return roundPrice(pv / volume);
}

export function calculateSkillEdgeATR(candles: SkillEdgeCandle[], period = 14) {
  const normalized = normalizeCandles(candles);

  if (normalized.length < 2) return null;

  const trueRanges: number[] = [];

  for (let i = 1; i < normalized.length; i += 1) {
    const current = normalized[i];
    const previous = normalized[i - 1];

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    trueRanges.push(tr);
  }

  const slice = trueRanges.slice(-period);
  if (slice.length === 0) return null;

  return roundPrice(
    slice.reduce((sum, value) => sum + value, 0) / slice.length
  );
}

function findSwingLevels(candles: SkillEdgeCandle[], lookback = 2) {
  const normalized = normalizeCandles(candles);
  const swingHighs: SkillEdgeStructureLevel[] = [];
  const swingLows: SkillEdgeStructureLevel[] = [];

  if (normalized.length < lookback * 2 + 1) {
    return { swingHighs, swingLows };
  }

  for (let i = lookback; i < normalized.length - lookback; i += 1) {
    const current = normalized[i];

    const left = normalized.slice(i - lookback, i);
    const right = normalized.slice(i + 1, i + 1 + lookback);

    const isSwingHigh =
      left.every((candle) => current.high >= candle.high) &&
      right.every((candle) => current.high >= candle.high);

    const isSwingLow =
      left.every((candle) => current.low <= candle.low) &&
      right.every((candle) => current.low <= candle.low);

    if (isSwingHigh) {
      swingHighs.push({
        price: current.high,
        label: "Swing high",
        type: "swing_high",
      });
    }

    if (isSwingLow) {
      swingLows.push({
        price: current.low,
        label: "Swing low",
        type: "swing_low",
      });
    }
  }

  return { swingHighs, swingLows };
}

function getKyivHour(timestampMs: number) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    hour12: false,
  });

  const value = Number(formatter.format(new Date(timestampMs)));

  return Number.isFinite(value) ? value : null;
}

function getSessionLevels(candles: SkillEdgeCandle[]) {
  const normalized = normalizeCandles(candles);

  if (normalized.length === 0) {
    return {
      dayHigh: null,
      dayLow: null,
      premarketHigh: null,
      premarketLow: null,
      rangeMidpoint: null,
    };
  }

  const highs = normalized.map((candle) => candle.high);
  const lows = normalized.map((candle) => candle.low);

  const dayHigh = Math.max(...highs);
  const dayLow = Math.min(...lows);

  const premarketCandles = normalized.filter((candle) => {
    const hour = getKyivHour(candle.timestampMs);

    return hour !== null && hour >= 13 && hour < 16;
  });

  const premarketHigh =
    premarketCandles.length > 0
      ? Math.max(...premarketCandles.map((candle) => candle.high))
      : null;

  const premarketLow =
    premarketCandles.length > 0
      ? Math.min(...premarketCandles.map((candle) => candle.low))
      : null;

  return {
    dayHigh: roundPrice(dayHigh),
    dayLow: roundPrice(dayLow),
    premarketHigh: roundPrice(premarketHigh),
    premarketLow: roundPrice(premarketLow),
    rangeMidpoint: roundPrice((dayHigh + dayLow) / 2),
  };
}

function dedupeLevels(levels: SkillEdgeStructureLevel[]) {
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const result: SkillEdgeStructureLevel[] = [];

  for (const level of sorted) {
    const last = result[result.length - 1];

    if (!last || Math.abs(last.price - level.price) / level.price > 0.0025) {
      result.push({
        ...level,
        price: Number(level.price),
      });
    }
  }

  return result;
}

function getNearestLevels({
  levels,
  price,
}: {
  levels: SkillEdgeStructureLevel[];
  price: number;
}) {
  const clean = dedupeLevels(levels).filter((level) => level.price > 0);

  const below = clean
    .filter((level) => level.price < price)
    .sort((a, b) => b.price - a.price);

  const above = clean
    .filter((level) => level.price > price)
    .sort((a, b) => a.price - b.price);

  return {
    nearestSupport: below[0] ?? null,
    secondSupport: below[1] ?? null,
    thirdSupport: below[2] ?? null,
    nearestResistance: above[0] ?? null,
    secondResistance: above[1] ?? null,
    thirdResistance: above[2] ?? null,
  };
}

function calculateRR({
  direction,
  entry,
  stop,
  target,
}: {
  direction: SkillEdgeStructureDirection;
  entry: number | null;
  stop: number | null;
  target: number | null;
}) {
  if (entry === null || stop === null || target === null) return null;

  const risk = direction === "upside" ? entry - stop : stop - entry;
  const reward = direction === "upside" ? target - entry : entry - target;

  if (risk <= 0 || reward <= 0) return null;

  return Math.round((reward / risk) * 100) / 100;
}

function buildFallbackPlan({
  direction,
  price,
}: {
  direction: SkillEdgeStructureDirection;
  price: number;
}): SkillEdgeStructureTradePlan {
  const isShort = direction === "downside";

  const entryMin = isShort ? price * 0.995 : price * 0.998;
  const entryMax = isShort ? price * 1.005 : price * 1.008;
  const stop = isShort ? price * 1.018 : price * 0.982;
  const target1 = isShort ? price * 0.98 : price * 1.022;
  const target2 = isShort ? price * 0.955 : price * 1.045;
  const target3 = isShort ? price * 0.93 : price * 1.07;
  const entry = (entryMin + entryMax) / 2;

  return {
    source: "fallback",
    trigger_label: isShort
      ? "Fallback short trigger вЂ” wait for breakdown confirmation"
      : "Fallback long trigger вЂ” wait for continuation confirmation",
    entry_zone_min: roundPrice(entryMin),
    entry_zone_max: roundPrice(entryMax),
    stop_price: roundPrice(stop),
    target_1: roundPrice(target1),
    target_2: roundPrice(target2),
    target_3: roundPrice(target3),
    invalidation: isShort
      ? "Invalid if price reclaims the failed level and holds above the stop."
      : "Invalid if price loses the reclaim/hold level and accepts below the stop.",
    management_plan:
      "This is fallback planning because candle structure is missing. Reduce confidence and wait for visible confirmation before acting.",
    risk_reward_ratio: calculateRR({
      direction,
      entry,
      stop,
      target: target3,
    }),
    vwap: null,
    atr: null,
    nearest_support: null,
    nearest_resistance: null,
    structure_notes: [
      "Fallback plan used because candles/VWAP/levels were not available. Signal generator should reject fallback plans before client delivery.",
    ],
    missing_structure_data: ["candles", "VWAP", "swing levels"],
  };
}

export function buildSkillEdgeStructureTradePlan({
  direction,
  candles,
  fallbackPrice,
  setupSlug,
}: {
  direction: SkillEdgeStructureDirection;
  candles?: SkillEdgeCandle[] | null;
  fallbackPrice?: number | null;
  setupSlug?: string | null;
}): SkillEdgeStructureTradePlan {
  const normalized = normalizeCandles(candles ?? []);
  const lastCandle = normalized[normalized.length - 1] ?? null;
  const price = lastCandle?.close ?? toNumber(fallbackPrice);

  if (!price || normalized.length < 10) {
    return buildFallbackPlan({
      direction,
      price: price || 1,
    });
  }

  const vwap = calculateSkillEdgeVWAP(normalized);
  const atr = calculateSkillEdgeATR(normalized);
  const { swingHighs, swingLows } = findSwingLevels(normalized);
  const session = getSessionLevels(normalized);

  const levels: SkillEdgeStructureLevel[] = [
    ...swingHighs,
    ...swingLows,
  ];

  if (vwap !== null) {
    levels.push({
      price: vwap,
      label: "VWAP",
      type: "vwap",
    });
  }

  if (session.dayHigh !== null) {
    levels.push({
      price: session.dayHigh,
      label: "Day high",
      type: "day_high",
    });
  }

  if (session.dayLow !== null) {
    levels.push({
      price: session.dayLow,
      label: "Day low",
      type: "day_low",
    });
  }

  if (session.premarketHigh !== null) {
    levels.push({
      price: session.premarketHigh,
      label: "Premarket high",
      type: "premarket_high",
    });
  }

  if (session.premarketLow !== null) {
    levels.push({
      price: session.premarketLow,
      label: "Premarket low",
      type: "premarket_low",
    });
  }

  if (session.rangeMidpoint !== null) {
    levels.push({
      price: session.rangeMidpoint,
      label: "Range midpoint",
      type: "range_midpoint",
    });
  }

  const nearest = getNearestLevels({
    levels,
    price,
  });

  const structureNotes: string[] = [];
  const missingStructureData: string[] = [];

  if (vwap === null) missingStructureData.push("VWAP");
  if (atr === null) missingStructureData.push("ATR");
  if (!nearest.nearestSupport) missingStructureData.push("nearest support");
  if (!nearest.nearestResistance) missingStructureData.push("nearest resistance");

  const atrValue = atr ?? price * 0.02;

  if (direction === "downside") {
    const resistance =
      nearest.nearestResistance ??
      (vwap && vwap > price
        ? {
            price: vwap,
            label: "VWAP",
            type: "vwap" as const,
          }
        : null);

    const support1 = nearest.nearestSupport;
    const support2 = nearest.secondSupport;
    const support3 = nearest.thirdSupport;

    const entryMin = roundPrice(price * 0.997);
    const entryMax = roundPrice(
      resistance ? Math.min(resistance.price * 0.998, price * 1.006) : price * 1.004
    );

    const entry =
      entryMin !== null && entryMax !== null ? (entryMin + entryMax) / 2 : price;

    const stop =
      resistance !== null
        ? Math.max(resistance.price + atrValue * 0.15, entry + atrValue * 0.35)
        : entry + atrValue * 0.75;

    const riskToStop = Math.abs(stop - entry);
    const downsideCandidates = [support1?.price, support2?.price, support3?.price]
      .filter((value): value is number => typeof value === "number" && value < entry)
      .sort((a, b) => b - a);

    const pickDownsideTarget = (minimumR: number, fallback: number) =>
      downsideCandidates.find((level) => level <= entry - riskToStop * minimumR) ?? fallback;

    const target1 = pickDownsideTarget(2, entry - riskToStop * 2);
    const target2 = pickDownsideTarget(3, entry - riskToStop * 3);
    const target3 = pickDownsideTarget(4, entry - riskToStop * 4);

    structureNotes.push(
      resistance
        ? `Short invalidation is built above ${resistance.label}.`
        : "Short invalidation is ATR-based because no nearby resistance was found."
    );

    if (support1) {
      structureNotes.push(`First downside target uses ${support1.label}.`);
    }

    return {
      source: "structure",
      trigger_label: setupSlug?.includes("vwap")
        ? "Short trigger: VWAP/rejection structure holds and breakdown confirms"
        : "Short trigger: failed level/rejection confirms and price breaks lower",
      entry_zone_min: entryMin,
      entry_zone_max: entryMax,
      stop_price: roundPrice(stop),
      target_1: roundPrice(target1),
      target_2: roundPrice(target2),
      target_3: roundPrice(target3),
      invalidation: resistance
        ? `Invalid if price reclaims and holds above ${resistance.label} (${roundPrice(
            resistance.price
          )}).`
        : "Invalid if price reclaims the breakdown area and holds above the structure stop.",
      management_plan:
        "Take partial profit at TP1, reduce risk if price stalls, and keep the runner only if selling pressure continues. Do not chase if entry is far below the planned zone.",
      risk_reward_ratio: calculateRR({
        direction,
        entry,
        stop,
        target: target1,
      }),
      vwap,
      atr,
      nearest_support: nearest.nearestSupport,
      nearest_resistance: nearest.nearestResistance,
      structure_notes: structureNotes,
      missing_structure_data: missingStructureData,
    };
  }

  const support =
    nearest.nearestSupport ??
    (vwap && vwap < price
      ? {
          price: vwap,
          label: "VWAP",
          type: "vwap" as const,
        }
      : null);

  const resistance1 = nearest.nearestResistance;
  const resistance2 = nearest.secondResistance;
  const resistance3 = nearest.thirdResistance;

  const entryMin = roundPrice(
    support ? Math.max(support.price * 1.002, price * 0.994) : price * 0.996
  );
  const entryMax = roundPrice(price * 1.003);

  const entry =
    entryMin !== null && entryMax !== null ? (entryMin + entryMax) / 2 : price;

  const stop =
    support !== null
      ? Math.min(support.price - atrValue * 0.15, entry - atrValue * 0.35)
      : entry - atrValue * 0.75;

  const riskToStop = Math.abs(entry - stop);
  const upsideCandidates = [resistance1?.price, resistance2?.price, resistance3?.price]
    .filter((value): value is number => typeof value === "number" && value > entry)
    .sort((a, b) => a - b);

  const pickUpsideTarget = (minimumR: number, fallback: number) =>
    upsideCandidates.find((level) => level >= entry + riskToStop * minimumR) ?? fallback;

  const target1 = pickUpsideTarget(2, entry + riskToStop * 2);
  const target2 = pickUpsideTarget(3, entry + riskToStop * 3);
  const target3 = pickUpsideTarget(4, entry + riskToStop * 4);

  structureNotes.push(
    support
      ? `Long invalidation is built below ${support.label}.`
      : "Long invalidation is ATR-based because no nearby support was found."
  );

  if (resistance1) {
    structureNotes.push(`First upside target uses ${resistance1.label}.`);
  }

  return {
    source: "structure",
    trigger_label: setupSlug?.includes("reclaim")
      ? "Long trigger: reclaim holds and continuation confirms"
      : "Long trigger: support/level holds and price expands higher",
    entry_zone_min: entryMin,
    entry_zone_max: entryMax,
    stop_price: roundPrice(stop),
    target_1: roundPrice(target1),
    target_2: roundPrice(target2),
    target_3: roundPrice(target3),
    invalidation: support
      ? `Invalid if price loses and accepts below ${support.label} (${roundPrice(
          support.price
        )}).`
      : "Invalid if price loses the hold/reclaim area and accepts below the structure stop.",
    management_plan:
      "Take partial profit at TP1, move risk only after confirmation, and keep the runner only if volume continues. Do not chase if entry is far above the planned zone.",
    risk_reward_ratio: calculateRR({
      direction,
      entry,
      stop,
      target: target3,
    }),
    vwap,
    atr,
    nearest_support: nearest.nearestSupport,
    nearest_resistance: nearest.nearestResistance,
    structure_notes: structureNotes,
    missing_structure_data: missingStructureData,
  };
}
