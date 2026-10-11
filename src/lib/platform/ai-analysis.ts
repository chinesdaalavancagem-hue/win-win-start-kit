import {
  computeAssetCalcs,
  type AssetKey,
  type State,
} from "@/lib/platform/engine";

export interface AnalysisDay {
  day: number;
  target: number;
  lots: number;
  costIfPass: number;
  lossIfFail: number;
  cumulativeCostIfPass: number;
  percentOfCapitalUsed: number;
  capitalCoversCumulativeCost: boolean;
}

export interface DeterministicAnalysis {
  asset: AssetKey;
  capitalAvailable: number;
  totalCostIfAllDaysPass: number;
  daysAboveCapital: number[];
  days: AnalysisDay[];
}

/** Calcula os números exclusivamente com o motor determinístico existente. */
export function buildDeterministicAnalysis(
  state: State,
  assetKey: AssetKey,
  capitalAvailable: number,
): DeterministicAnalysis {
  if (!Number.isFinite(capitalAvailable) || capitalAvailable <= 0 || capitalAvailable > 1_000_000_000) {
    throw new Error("Informe uma banca positiva de até 1 bilhão.");
  }

  const asset = state.assets[assetKey];
  const calculations = computeAssetCalcs(asset, assetKey);
  let cumulativeCost = 0;
  const days = asset.days.map((day, index) => {
    const calculation = calculations[index]!;
    const fee = index === 0 ? Math.max(0, asset.params.taxa) : 0;
    const costIfPass = Math.max(0, calculation.custoSePassar) + fee;
    const lossIfFail = Math.max(0, calculation.reprova);
    cumulativeCost += costIfPass;
    return {
      day: index + 1,
      target: day.meta,
      lots: day.lotes,
      costIfPass,
      lossIfFail,
      cumulativeCostIfPass: cumulativeCost,
      percentOfCapitalUsed: (cumulativeCost / capitalAvailable) * 100,
      capitalCoversCumulativeCost: cumulativeCost <= capitalAvailable,
    };
  });

  return {
    asset: assetKey,
    capitalAvailable,
    totalCostIfAllDaysPass: cumulativeCost,
    daysAboveCapital: days.filter((day) => !day.capitalCoversCumulativeCost).map((day) => day.day),
    days,
  };
}
