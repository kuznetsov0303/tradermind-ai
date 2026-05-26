import type {
  SkillEdgeConfidenceResult,
  SkillEdgeSignalCandidateContext,
} from "@/lib/trading/signal-confidence";

export type SkillEdgePersonalSignalPriority =
  | "strong_match"
  | "good_match"
  | "neutral"
  | "caution"
  | "avoid_for_now";

export type SkillEdgeUserSetupProfile = {
  userId: string;
  totalClosedTrades: number;
  profitableSetupSlugs: string[];
  weakSetupSlugs: string[];
  bestMarketTypes: string[];
  weakMarketTypes: string[];
  bestTimeWindows: string[];
  weakTimeWindows: string[];
  commonMistakes: string[];
  preferredDirections: ("long" | "short")[];
  averagePlannedRiskReward?: number | null;
  averageRealizedRiskReward?: number | null;
};

export type SkillEdgePersonalSignalOverlay = {
  hasEnoughData: boolean;
  priority: SkillEdgePersonalSignalPriority;
  personalScoreAdjustment: number;
  label: string;
  reason: string;
  warnings: string[];
};

const MIN_TRADES_FOR_PERSONALIZATION = 20;

export function buildEmptyPersonalOverlay(): SkillEdgePersonalSignalOverlay {
  return {
    hasEnoughData: false,
    priority: "neutral",
    personalScoreAdjustment: 0,
    label: "Profile collecting data",
    reason:
      "SkillEdge will personalize this signal after enough journal history is collected.",
    warnings: [],
  };
}

export function buildSkillEdgePersonalSignalOverlay({
  signal,
  context,
  profile,
}: {
  signal: SkillEdgeConfidenceResult;
  context: SkillEdgeSignalCandidateContext;
  profile: SkillEdgeUserSetupProfile | null;
}): SkillEdgePersonalSignalOverlay {
  if (!profile || profile.totalClosedTrades < MIN_TRADES_FOR_PERSONALIZATION) {
    return buildEmptyPersonalOverlay();
  }

  let adjustment = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (profile.profitableSetupSlugs.includes(signal.setupSlug)) {
    adjustment += 8;
    reasons.push("This setup matches the userвЂ™s profitable journal patterns.");
  }

  if (profile.weakSetupSlugs.includes(signal.setupSlug)) {
    adjustment -= 10;
    warnings.push(
      "This setup is connected to weaker historical execution for this user."
    );
  }

  if (profile.bestMarketTypes.includes(context.assetType)) {
    adjustment += 3;
    reasons.push("This market type matches the userвЂ™s stronger history.");
  }

  if (profile.weakMarketTypes.includes(context.assetType)) {
    adjustment -= 4;
    warnings.push("This market type has been weaker for this user.");
  }

  const direction =
    signal.direction === "downside" ? "short" : "long";

  if (profile.preferredDirections.includes(direction)) {
    adjustment += 3;
    reasons.push("Direction matches the userвЂ™s stronger trading history.");
  }

  const personalSimilarityScore =
    typeof context.personalSimilarityScore === "number"
      ? context.personalSimilarityScore
      : null;

  const personalWarningScore =
    typeof context.personalWarningScore === "number"
      ? context.personalWarningScore
      : null;

  if (personalSimilarityScore !== null && personalSimilarityScore >= 75) {
    adjustment += 6;
    reasons.push("Pattern similarity to profitable trades is high.");
  }

  if (personalWarningScore !== null && personalWarningScore >= 70) {
    adjustment -= 8;
    warnings.push(
      "Pattern also resembles situations where the user made repeated mistakes."
    );
  }

  if (
    profile.averageRealizedRiskReward !== null &&
    profile.averageRealizedRiskReward !== undefined &&
    profile.averageRealizedRiskReward < 1.2
  ) {
    warnings.push(
      "The userвЂ™s realized RR has been weak. Execution discipline is important."
    );
  }

  let priority: SkillEdgePersonalSignalPriority = "neutral";
  let label = "Neutral for your profile";

  if (adjustment >= 10) {
    priority = "strong_match";
    label = "Strong personal match";
  } else if (adjustment >= 4) {
    priority = "good_match";
    label = "Good personal match";
  } else if (adjustment <= -12) {
    priority = "avoid_for_now";
    label = "Personal caution: avoid for now";
  } else if (adjustment < 0) {
    priority = "caution";
    label = "Personal caution";
  }

  return {
    hasEnoughData: true,
    priority,
    personalScoreAdjustment: adjustment,
    label,
    reason:
      reasons.length > 0
        ? reasons.join(" ")
        : "No strong personal edge or warning detected yet.",
    warnings,
  };
}

export function applyPersonalOverlayToSignalScore({
  baseScore,
  overlay,
}: {
  baseScore: number;
  overlay: SkillEdgePersonalSignalOverlay;
}) {
  return Math.max(
    0,
    Math.min(100, Math.round(baseScore + overlay.personalScoreAdjustment))
  );
}
