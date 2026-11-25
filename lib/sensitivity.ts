// The token radar's sensitivity band: how far one protocol's implied value can move when the
// model's two market-driven inputs are stressed, and how much the calibration behind the row can
// be trusted. The band never changes the board's ranking — the base implied value still orders
// the rows — it only says how wide the estimate is and where the rank would land in the low and
// high cases.
//
// The two inputs the band varies are the ones the market itself sets: the category multiple
// (the median market-cap-to-TVL ratio of the category's live-token protocols, shrunk toward the
// global median) and the seven-day growth. Breadth and maturity stay exactly as the model states
// them: they are structural — how many chains a protocol runs on, and how long it has run with no
// token — not market prices, so they do not move in a market scenario.
//
//   low case   multiple x 0.75, growth halved when positive and deepened when negative
//   high case  multiple x 1.25, growth deepened when positive and halved when negative
//
// Both cases keep the model's own clamps: the multiple stays inside [multiple_floor,
// multiple_cap] and the growth stays inside [growth_floor, growth_cap]. The low case is
// therefore never below the model's floor and the high case never above its cap. Because the
// implied value rises with both the multiple and the growth multiplier, the low case always lands
// at or below the base implied value and the high case always at or above it.
//
// Confidence is a second, separate statement: how well the row's calibration is supported. It
// follows the number of live comps in the category — a category that fell back to the global
// median, with fewer than comps_min_n live comps, is a weaker calibration than one with ten —
// and the breadth multiplier, because a protocol on more chains has more independent evidence of
// activity. It is a 0..1 score, rounded to two decimals, read as High (>= 0.8), Medium (>= 0.6)
// or Low. A wide band on a low-confidence row is the radar saying "this one is a guess"; a narrow
// band on a high-confidence row is the radar saying "the market has priced this shape before".

import type { Comps, ModelConstants } from './model.ts';

/** How much the multiple moves in each scenario: a quarter off, a quarter on. */
export const MULTIPLE_DOWN = 0.75;
export const MULTIPLE_UP = 1.25;

/** How much the growth moves in each scenario: half, and one-and-a-half times. */
export const GROWTH_DOWN = 0.5;
export const GROWTH_UP = 1.5;

/** The confidence cut-offs the dashboard reads as High, Medium and Low. */
export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_MEDIUM = 0.6;

/** The model inputs one row's band is computed from: the decomposition impliedValue returns. */
export interface SensitivityInput {
  tvl_usd: number;
  category_multiple: number;
  breadth_multiplier: number;
  growth_pct: number;
  maturity_multiplier: number;
  comps_n: number;
}

/** One scenario of the band: the inputs it varies and the implied value they give. */
export interface SensitivityScenario {
  label: 'Low' | 'Base' | 'High';
  multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  implied_usd: number;
}

/** A row's sensitivity band: the low and high implied values, the confidence, and the inputs. */
export interface SensitivityBand {
  implied_low_usd: number;
  implied_high_usd: number;
  confidence: number;
  multiple_low: number;
  multiple_high: number;
  growth_low_pct: number;
  growth_high_pct: number;
  width_pct: number;
  summary: string;
}

/** A number inside [lo, hi]. */
function clampNum(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** A number rounded to four decimals, for the multiples the band reports. */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** The growth the low case uses: half a positive growth, one-and-a-half times a negative one. */
function growthLowPct(growthPct: number, model: ModelConstants): number {
  const scaled = growthPct >= 0 ? growthPct * GROWTH_DOWN : growthPct * GROWTH_UP;
  return clampNum(scaled, model.growth_floor, model.growth_cap);
}

/** The growth the high case uses: one-and-a-half times a positive growth, half a negative one. */
function growthHighPct(growthPct: number, model: ModelConstants): number {
  const scaled = growthPct >= 0 ? growthPct * GROWTH_UP : growthPct * GROWTH_DOWN;
  return clampNum(scaled, model.growth_floor, model.growth_cap);
}

/** The multiple the low case uses: a quarter off, kept inside the model's own clamps. */
function multipleLow(catMultiple: number, model: ModelConstants): number {
  return clampNum(catMultiple * MULTIPLE_DOWN, model.multiple_floor, model.multiple_cap);
}

/** The multiple the high case uses: a quarter on, kept inside the model's own clamps. */
function multipleHigh(catMultiple: number, model: ModelConstants): number {
  return clampNum(catMultiple * MULTIPLE_UP, model.multiple_floor, model.multiple_cap);
}

/** The growth multiplier one growth percentage gives under the model. */
function growthMultiplier(growthPct: number, model: ModelConstants): number {
  return 1 + (growthPct / 100) * model.growth_weight;
}

/** The implied value under one multiple and one growth, with the model's other multipliers. */
function impliedUnder(
  tvlUsd: number,
  multiple: number,
  growthPct: number,
  breadthMult: number,
  maturityMult: number,
  model: ModelConstants,
): number {
  return Math.max(1, Math.round(tvlUsd * multiple * breadthMult * growthMultiplier(growthPct, model) * maturityMult));
}

/** A dollar amount in the short form the dashboard uses: $441.3M, $12.4K, $950. */
function usdShort(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** How many live comps back one category: the row's count, or 0 when it has no row at all. */
export function compsCountFor(category: string | null, comps: Comps): number {
  const key = category ?? 'Other';
  const row = comps.rows.find((r) => r.category === key);
  return row === undefined ? 0 : row.n;
}

/**
 * The confidence of one row: how well its calibration is supported. A category with at least
 * comps_min_n live comps scores from 0.65 at the minimum count up to 1 at ten comps; a category
 * below the minimum, which fell back to the global median, scores 0.3. Breadth adds up to 0.3
 * more: a protocol on one chain scores 0.5 there and a protocol on six or more scores 1.
 */
export function confidenceFor(compsN: number, breadthMult: number, model: ModelConstants): number {
  const compsScore = compsN >= model.comps_min_n ? Math.min(1, 0.5 + 0.05 * compsN) : 0.3;
  const breadthScore = 0.5 + 0.5 * clampNum((breadthMult - 1) / (model.breadth_max - 1), 0, 1);
  return Math.round((0.7 * compsScore + 0.3 * breadthScore) * 100) / 100;
}

/** The confidence score as a word: High at 0.8, Medium at 0.6, Low below that. */
export function confidenceLabel(confidence: number): string {
  if (confidence >= CONFIDENCE_HIGH) return 'High';
  if (confidence >= CONFIDENCE_MEDIUM) return 'Medium';
  return 'Low';
}

/** The band's width as a share of the base implied value, in per cent, one decimal. */
function bandWidthPct(lowUsd: number, highUsd: number, baseUsd: number): number {
  if (baseUsd <= 0) return 0;
  return Math.round(((highUsd - lowUsd) / baseUsd) * 1000) / 10;
}

/** One sentence that states the band: its range, its width and its confidence. */
function sensitivityText(lowUsd: number, highUsd: number, widthPct: number, confidence: number): string {
  return `The estimate spans ${usdShort(lowUsd)}–${usdShort(highUsd)}, a ${widthPct}% band, with ${confidenceLabel(confidence)} confidence (${confidence.toFixed(2)}).`;
}

/**
 * The three scenarios of one row's band, low, base and high, in that order. The base scenario is
 * the model's own implied value; the low and high scenarios vary only the multiple and the
 * growth, with breadth and maturity exactly as the model states them.
 */
export function sensitivityScenarios(input: SensitivityInput, baseImpliedUsd: number, model: ModelConstants): SensitivityScenario[] {
  const lowMultiple = multipleLow(input.category_multiple, model);
  const highMultiple = multipleHigh(input.category_multiple, model);
  const lowGrowth = growthLowPct(input.growth_pct, model);
  const highGrowth = growthHighPct(input.growth_pct, model);
  return [
    {
      label: 'Low',
      multiple: round4(lowMultiple),
      growth_pct: lowGrowth,
      growth_multiplier: round4(growthMultiplier(lowGrowth, model)),
      implied_usd: impliedUnder(input.tvl_usd, lowMultiple, lowGrowth, input.breadth_multiplier, input.maturity_multiplier, model),
    },
    {
      label: 'Base',
      multiple: round4(input.category_multiple),
      growth_pct: input.growth_pct,
      growth_multiplier: round4(growthMultiplier(input.growth_pct, model)),
      implied_usd: baseImpliedUsd,
    },
    {
      label: 'High',
      multiple: round4(highMultiple),
      growth_pct: highGrowth,
      growth_multiplier: round4(growthMultiplier(highGrowth, model)),
      implied_usd: impliedUnder(input.tvl_usd, highMultiple, highGrowth, input.breadth_multiplier, input.maturity_multiplier, model),
    },
  ];
}

/**
 * One row's sensitivity band. The base implied value is the board's own number, passed in, so the
 * band always brackets the value the board ranks on: the low case at or below it, the high case
 * at or above it.
 */
export function sensitivityBand(input: SensitivityInput, baseImpliedUsd: number, model: ModelConstants): SensitivityBand {
  const scenarios = sensitivityScenarios(input, baseImpliedUsd, model);
  const low = scenarios[0]!;
  const high = scenarios[2]!;
  const confidence = confidenceFor(input.comps_n, input.breadth_multiplier, model);
  const width = bandWidthPct(low.implied_usd, high.implied_usd, baseImpliedUsd);
  return {
    implied_low_usd: low.implied_usd,
    implied_high_usd: high.implied_usd,
    confidence,
    multiple_low: low.multiple,
    multiple_high: high.multiple,
    growth_low_pct: low.growth_pct,
    growth_high_pct: high.growth_pct,
    width_pct: width,
    summary: sensitivityText(low.implied_usd, high.implied_usd, width, confidence),
  };
}

/**
 * The rank each row would hold if every row were scored at its low — or its high — implied
 * value, strongest first, ties broken by slug so two runs agree. A row whose rank barely moves
 * between the two is a rank the band barely threatens; a row that moves far is a rank built on
 * one optimistic assumption.
 */
export function rankByBand(
  rows: { slug: string; implied_low_usd: number; implied_high_usd: number }[],
  which: 'low' | 'high',
): Map<string, number> {
  const key = which === 'low' ? 'implied_low_usd' : 'implied_high_usd';
  return new Map(
    [...rows]
      .sort((a, b) => b[key] - a[key] || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
      .map((r, i) => [r.slug, i + 1] as [string, number]),
  );
}

/** One category's sensitivity aggregate: how wide its rows' bands run and how confident they are. */
export interface CategorySensitivity {
  category: string;
  rows: number;
  median_width_pct: number;
  median_confidence: number;
}

/** The median of a list of numbers; 0 for an empty list. */
function medianOfNumbers(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * One aggregate per category, sorted by category name: how many rows it has, the median band
 * width of its rows and their median confidence. A category with a wide median band and low
 * median confidence is one the market has not priced yet; a narrow, confident category is one
 * whose shape the market already knows.
 */
export function sensitivityByCategory(
  rows: { category: string | null; width_pct: number; confidence: number }[],
): CategorySensitivity[] {
  const byCategory = new Map<string, { widths: number[]; confidences: number[] }>();
  for (const r of rows) {
    const key = r.category ?? 'Other';
    const entry = byCategory.get(key) ?? { widths: [], confidences: [] };
    entry.widths.push(r.width_pct);
    entry.confidences.push(r.confidence);
    byCategory.set(key, entry);
  }
  return [...byCategory.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([category, entry]) => ({
      category,
      rows: entry.widths.length,
      median_width_pct: Math.round(medianOfNumbers(entry.widths) * 10) / 10,
      median_confidence: Math.round(medianOfNumbers(entry.confidences) * 100) / 100,
    }));
}

/** How many confidence scores land in each band, for the dashboard's headline facts. */
export function sensitivitySummary(confidences: number[]): { high: number; medium: number; low: number } {
  const out = { high: 0, medium: 0, low: 0 };
  for (const c of confidences) {
    const label = confidenceLabel(c);
    if (label === 'High') out.high++;
    else if (label === 'Medium') out.medium++;
    else out.low++;
  }
  return out;
}
