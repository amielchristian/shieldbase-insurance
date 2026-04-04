import { z } from "zod";

export type QuoteProduct = "auto" | "home" | "life";
export type CoverageLevel = "basic" | "standard" | "comprehensive";

export type QuoteStep =
  | "identify_product"
  | "collect_details"
  | "review"
  | "validate"
  | "generate"
  | "confirm"
  | "done";

export type DrivingHistory = "clean" | "minor_violations" | "accident";
export type PropertyType = "single_family" | "condo" | "townhouse" | "renters";
export type HealthStatus = "excellent" | "good" | "fair" | "poor";
export type TermLengthYears = 10 | 20 | 30;

export type AutoQuoteData = Partial<{
  vehicleYear: number;
  make: string;
  model: string;
  driverAge: number;
  drivingHistory: DrivingHistory;
  coverageLevel: CoverageLevel;
}>;

export type HomeQuoteData = Partial<{
  propertyType: PropertyType;
  location: string;
  estimatedValue: number;
  coverageLevel: CoverageLevel;
}>;

export type LifeQuoteData = Partial<{
  age: number;
  healthStatus: HealthStatus;
  coverageAmount: number;
  termLengthYears: TermLengthYears;
}>;

export type QuoteDataByProduct = {
  auto: AutoQuoteData;
  home: HomeQuoteData;
  life: LifeQuoteData;
};

export type QuoteBreakdownLine = { label: string; amount: number };
export type QuoteResult = {
  monthlyPremium: number;
  annualPremium: number;
  breakdown: QuoteBreakdownLine[];
  currency: "USD";
};

export type QuoteState = {
  active: boolean;
  status: "inactive" | "drafting" | "review" | "quoted";
  lastUpdatedAt: string;
  product: QuoteProduct | null;
  step: QuoteStep;
  pendingField: string | null;
  data: QuoteDataByProduct;
  lastQuote: QuoteResult | null;
};

export function createInitialQuoteState(): QuoteState {
  return {
    active: false,
    status: "inactive",
    lastUpdatedAt: new Date().toISOString(),
    product: null,
    step: "identify_product",
    pendingField: null,
    data: { auto: {}, home: {}, life: {} },
    lastQuote: null,
  };
}

export const autoSchema = z.object({
  vehicleYear: z.number().int().min(1980).max(new Date().getFullYear()),
  make: z.string().min(1),
  model: z.string().min(1),
  driverAge: z.number().int().min(16).max(100),
  drivingHistory: z.enum(["clean", "minor_violations", "accident"]),
  coverageLevel: z.enum(["basic", "standard", "comprehensive"]),
});

export const homeSchema = z.object({
  propertyType: z.enum(["single_family", "condo", "townhouse", "renters"]),
  location: z.string().min(1),
  estimatedValue: z.number().int().min(20001),
  coverageLevel: z.enum(["basic", "standard", "comprehensive"]),
});

export const lifeSchema = z.object({
  age: z.number().int().min(18).max(85),
  healthStatus: z.enum(["excellent", "good", "fair", "poor"]),
  coverageAmount: z.number().int().min(25_000).max(2_000_000),
  termLengthYears: z.union([z.literal(10), z.literal(20), z.literal(30)]),
});

export function detectProduct(text: string): QuoteProduct | null {
  const t = text.toLowerCase();
  if (/\bauto\b|\bvehicle\b|\bcar\b|\bdriving\b/.test(t)) return "auto";
  if (/\bhome\b|\bhouse\b|\bproperty\b|\brenters?\b|\bcondo\b/.test(t)) return "home";
  if (/\blife\b|\bterm\b|\bbeneficiary\b/.test(t)) return "life";
  return null;
}

export function mergeQuoteData<T extends object>(left: T, right: Partial<T>): T {
  return { ...left, ...right };
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[, $]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function applyPendingField(product: QuoteProduct, pendingField: string, text: string): Partial<QuoteDataByProduct> {
  const value = text.trim();
  const lower = value.toLowerCase();

  const coverageLevel: CoverageLevel | null =
    /\bcomprehensive\b/.test(lower)
      ? "comprehensive"
      : /\bstandard\b/.test(lower)
        ? "standard"
        : /\bbasic\b/.test(lower)
          ? "basic"
          : null;

  const drivingHistory: DrivingHistory | null =
    /\bclean\b|\bno tickets\b|\bno accidents\b/.test(lower)
      ? "clean"
      : /\bminor\b|\bticket\b|\bviolation\b/.test(lower)
        ? "minor_violations"
        : /\baccident\b|\bcrash\b/.test(lower)
          ? "accident"
          : null;

  const healthStatus: HealthStatus | null =
    /\bexcellent\b/.test(lower)
      ? "excellent"
      : /\bgood\b/.test(lower)
        ? "good"
        : /\bfair\b/.test(lower)
          ? "fair"
          : /\bpoor\b/.test(lower)
            ? "poor"
            : null;

  const propertyType: PropertyType | null =
    /\brenters?\b/.test(lower)
      ? "renters"
      : /\bcondo\b/.test(lower)
        ? "condo"
        : /\btownhouse\b|\btownhome\b/.test(lower)
          ? "townhouse"
          : /\bsingle\s*family\b|\bhouse\b|\bhomeowners?\b/.test(lower)
            ? "single_family"
            : null;

  const termLengthYears = (() => {
    const m = lower.match(/\b(10|20|30)\b/);
    if (!m?.[1]) return null;
    const n = Number(m[1]) as TermLengthYears;
    return [10, 20, 30].includes(n) ? n : null;
  })();

  if (product === "auto") {
    switch (pendingField) {
      case "vehicleYear": {
        const n = parseNumber(value);
        return n ? { auto: { vehicleYear: n } } : {};
      }
      case "make":
        return { auto: { make: value } };
      case "model":
        return { auto: { model: value } };
      case "driverAge": {
        const n = parseNumber(value);
        return n ? { auto: { driverAge: n } } : {};
      }
      case "drivingHistory":
        return drivingHistory ? { auto: { drivingHistory } } : {};
      case "coverageLevel":
        return coverageLevel ? { auto: { coverageLevel } } : {};
      default:
        return {};
    }
  }

  if (product === "home") {
    switch (pendingField) {
      case "propertyType":
        return propertyType ? { home: { propertyType } } : {};
      case "location":
        return { home: { location: value } };
      case "estimatedValue": {
        const n = parseNumber(value);
        return n ? { home: { estimatedValue: n } } : {};
      }
      case "coverageLevel":
        return coverageLevel ? { home: { coverageLevel } } : {};
      default:
        return {};
    }
  }

  switch (pendingField) {
    case "age": {
      const n = parseNumber(value);
      return n ? { life: { age: n } } : {};
    }
    case "healthStatus":
      return healthStatus ? { life: { healthStatus } } : {};
    case "coverageAmount": {
      const n = parseNumber(value);
      return n ? { life: { coverageAmount: n } } : {};
    }
    case "termLengthYears":
      return termLengthYears ? { life: { termLengthYears } } : {};
    default:
      return {};
  }
}

export function extractQuoteEditsFromText(text: string): Partial<QuoteDataByProduct> {
  const t = text.trim();
  const lower = t.toLowerCase();

  const edits: Partial<QuoteDataByProduct> = {};

  // Coverage level
  const coverageLevel: CoverageLevel | null =
    /\bcomprehensive\b/.test(lower)
      ? "comprehensive"
      : /\bstandard\b/.test(lower)
        ? "standard"
        : /\bbasic\b/.test(lower)
          ? "basic"
          : null;

  // Driving history
  const drivingHistory: DrivingHistory | null =
    /\bclean\b|\bno tickets\b|\bno accidents\b/.test(lower)
      ? "clean"
      : /\bminor\b|\bticket\b|\bviolation\b/.test(lower)
        ? "minor_violations"
        : /\baccident\b|\bcrash\b/.test(lower)
          ? "accident"
          : null;

  // Health status
  const healthStatus: HealthStatus | null =
    /\bexcellent\b/.test(lower)
      ? "excellent"
      : /\bgood\b/.test(lower)
        ? "good"
        : /\bfair\b/.test(lower)
          ? "fair"
          : /\bpoor\b/.test(lower)
            ? "poor"
            : null;

  // Numbers
  const yearMatch = lower.match(/\b(19[8-9]\d|20\d{2})\b/);
  const ageMatch = lower.match(/\b(age\s*)?(\d{1,3})\b/);
  const amountMatch = lower.match(/\$?\s*([0-9]{2,3})(?:[, ]?([0-9]{3}))+(?:\.\d+)?/);
  const termMatch = lower.match(/\b(10|20|30)\s*(?:year|yr)s?\b/);

  // Simple make/model heuristic: "2019 toyota camry" -> make=toyota model=camry
  const makeModelMatch = lower.match(/\b(19[8-9]\d|20\d{2})\s+([a-z0-9]+)\s+([a-z0-9]+)\b/);

  if (coverageLevel) {
    edits.auto = { ...(edits.auto ?? {}), coverageLevel };
    edits.home = { ...(edits.home ?? {}), coverageLevel };
  }
  if (drivingHistory) {
    edits.auto = { ...(edits.auto ?? {}), drivingHistory };
  }
  if (healthStatus) {
    edits.life = { ...(edits.life ?? {}), healthStatus };
  }
  if (yearMatch?.[0]) {
    const vehicleYear = Number(yearMatch[0]);
    if (Number.isFinite(vehicleYear)) {
      edits.auto = { ...(edits.auto ?? {}), vehicleYear };
    }
  }
  if (makeModelMatch?.[2] && makeModelMatch?.[3]) {
    edits.auto = {
      ...(edits.auto ?? {}),
      make: makeModelMatch[2].toUpperCase(),
      model: makeModelMatch[3].toUpperCase(),
    };
  }
  if (ageMatch?.[2]) {
    const n = Number(ageMatch[2]);
    if (Number.isFinite(n)) {
      edits.auto = { ...(edits.auto ?? {}), driverAge: n };
      edits.life = { ...(edits.life ?? {}), age: n };
    }
  }
  if (termMatch?.[1]) {
    const n = Number(termMatch[1]) as TermLengthYears;
    if ([10, 20, 30].includes(n)) {
      edits.life = { ...(edits.life ?? {}), termLengthYears: n };
    }
  }
  if (amountMatch) {
    const whole = `${amountMatch[1]}${amountMatch[2] ? amountMatch[2] : ""}`;
    const n = Number(whole);
    if (Number.isFinite(n)) {
      // Use the same numeric capture for both home value and life coverage; product-specific validation will catch bad ranges.
      edits.home = { ...(edits.home ?? {}), estimatedValue: n };
      edits.life = { ...(edits.life ?? {}), coverageAmount: n };
    }
  }

  // Property type
  const propertyType: PropertyType | null =
    /\brenters?\b/.test(lower)
      ? "renters"
      : /\bcondo\b/.test(lower)
        ? "condo"
        : /\btownhouse\b|\btownhome\b/.test(lower)
          ? "townhouse"
          : /\bsingle\s*family\b|\bhouse\b|\bhomeowners?\b/.test(lower)
            ? "single_family"
            : null;

  if (propertyType) {
    edits.home = { ...(edits.home ?? {}), propertyType };
  }

  // Location: naive capture like "in Austin, TX" or "at Manila"
  const locMatch = t.match(/\b(?:in|at)\s+([A-Za-z .,'-]{3,})$/);
  if (locMatch?.[1]) {
    edits.home = { ...(edits.home ?? {}), location: locMatch[1].trim() };
  }

  return edits;
}

export function getMissingFields(product: QuoteProduct, data: QuoteDataByProduct): string[] {
  if (product === "auto") {
    const d = data.auto;
    const missing: string[] = [];
    if (!d.vehicleYear) missing.push("vehicleYear");
    if (!d.make) missing.push("make");
    if (!d.model) missing.push("model");
    if (!d.driverAge) missing.push("driverAge");
    if (!d.drivingHistory) missing.push("drivingHistory");
    if (!d.coverageLevel) missing.push("coverageLevel");
    return missing;
  }
  if (product === "home") {
    const d = data.home;
    const missing: string[] = [];
    if (!d.propertyType) missing.push("propertyType");
    if (!d.location) missing.push("location");
    if (!d.estimatedValue) missing.push("estimatedValue");
    if (!d.coverageLevel) missing.push("coverageLevel");
    return missing;
  }
  const d = data.life;
  const missing: string[] = [];
  if (!d.age) missing.push("age");
  if (!d.healthStatus) missing.push("healthStatus");
  if (!d.coverageAmount) missing.push("coverageAmount");
  if (!d.termLengthYears) missing.push("termLengthYears");
  return missing;
}

export function questionForField(product: QuoteProduct, field: string): string {
  if (product === "auto") {
    switch (field) {
      case "vehicleYear":
        return "What is the vehicle year? (e.g. 2020)";
      case "make":
        return "What is the vehicle make? (e.g. Toyota)";
      case "model":
        return "What is the vehicle model? (e.g. Camry)";
      case "driverAge":
        return "How old is the primary driver?";
      case "drivingHistory":
        return "Driving history: clean, minor violations, or accident?";
      case "coverageLevel":
        return "Coverage level: basic, standard, or comprehensive?";
      default:
        return "What detail should I use for your auto quote?";
    }
  }
  if (product === "home") {
    switch (field) {
      case "propertyType":
        return "What property type is this: single family, condo, townhouse, or renters?";
      case "location":
        return "What city/state is the property in? (e.g. Austin, TX)";
      case "estimatedValue":
        return "What is the estimated property value (roughly)? (e.g. 350000)";
      case "coverageLevel":
        return "Coverage level: basic, standard, or comprehensive?";
      default:
        return "What detail should I use for your home quote?";
    }
  }
  switch (field) {
    case "age":
      return "How old is the insured?";
    case "healthStatus":
      return "Health status: excellent, good, fair, or poor?";
    case "coverageAmount":
      return "What coverage amount do you want? (e.g. 250000)";
    case "termLengthYears":
      return "Term length: 10, 20, or 30 years?";
    default:
      return "What detail should I use for your life quote?";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeQuote(product: QuoteProduct, data: QuoteDataByProduct): QuoteResult {
  if (product === "auto") {
    const d = autoSchema.parse(data.auto);
    const breakdown: QuoteBreakdownLine[] = [];
    let monthly = 40;
    breakdown.push({ label: "Base", amount: 40 });

    const ageFactor = d.driverAge < 25 ? 35 : d.driverAge < 35 ? 15 : 8;
    monthly += ageFactor;
    breakdown.push({ label: "Driver age factor", amount: ageFactor });

    const historyFactor = d.drivingHistory === "clean" ? 0 : d.drivingHistory === "minor_violations" ? 18 : 45;
    monthly += historyFactor;
    breakdown.push({ label: "Driving history factor", amount: historyFactor });

    const coverageFactor = d.coverageLevel === "basic" ? 0 : d.coverageLevel === "standard" ? 12 : 28;
    monthly += coverageFactor;
    breakdown.push({ label: "Coverage level factor", amount: coverageFactor });

    const currentYear = new Date().getFullYear();
    const age = Math.max(0, currentYear - d.vehicleYear);
    const vehicleFactor = Math.max(0, 20 - age);
    monthly += vehicleFactor / 5;
    breakdown.push({ label: "Vehicle year factor", amount: vehicleFactor / 5 });

    const monthlyPremium = round2(monthly);
    return {
      monthlyPremium,
      annualPremium: round2(monthlyPremium * 12),
      breakdown,
      currency: "USD",
    };
  }

  if (product === "home") {
    const d = homeSchema.parse(data.home);
    const breakdown: QuoteBreakdownLine[] = [];
    const baseRate = 0.0025;
    const baseAnnual = d.estimatedValue * baseRate;
    breakdown.push({ label: "Base annual rate", amount: baseAnnual });

    const typeFactor =
      d.propertyType === "single_family"
        ? 1.15
        : d.propertyType === "townhouse"
          ? 1.05
          : d.propertyType === "condo"
            ? 0.95
            : 0.65;
    breakdown.push({ label: "Property type multiplier", amount: typeFactor });

    const coverageFactor = d.coverageLevel === "basic" ? 0.95 : d.coverageLevel === "standard" ? 1.0 : 1.12;
    breakdown.push({ label: "Coverage level multiplier", amount: coverageFactor });

    const annual = baseAnnual * typeFactor * coverageFactor;
    const annualPremium = round2(annual);
    return {
      monthlyPremium: round2(annualPremium / 12),
      annualPremium,
      breakdown,
      currency: "USD",
    };
  }

  const d = lifeSchema.parse(data.life);
  const breakdown: QuoteBreakdownLine[] = [];
  const perThousand = d.coverageAmount / 1000;
  breakdown.push({ label: "Coverage units (per $1,000)", amount: perThousand });

  const ageRate = d.age < 30 ? 0.22 : d.age < 45 ? 0.35 : d.age < 60 ? 0.6 : 1.05;
  breakdown.push({ label: "Age band rate", amount: ageRate });

  const healthMult = d.healthStatus === "excellent" ? 0.85 : d.healthStatus === "good" ? 1.0 : d.healthStatus === "fair" ? 1.35 : 1.8;
  breakdown.push({ label: "Health multiplier", amount: healthMult });

  const termMult = d.termLengthYears === 10 ? 0.9 : d.termLengthYears === 20 ? 1.0 : 1.12;
  breakdown.push({ label: "Term multiplier", amount: termMult });

  const monthly = perThousand * ageRate * healthMult * termMult;
  const monthlyPremium = round2(monthly);
  return {
    monthlyPremium,
    annualPremium: round2(monthlyPremium * 12),
    breakdown,
    currency: "USD",
  };
}

export function formatQuote(product: QuoteProduct, quote: QuoteResult): string {
  const lines = quote.breakdown
    .map((l) => `- ${l.label}: ${typeof l.amount === "number" ? l.amount.toFixed(2) : String(l.amount)}`)
    .join("\n");
  return [
    `Here is your **${product}** quote (illustrative estimate):`,
    "",
    `- Monthly: **$${quote.monthlyPremium.toFixed(2)}**`,
    `- Annual: **$${quote.annualPremium.toFixed(2)}**`,
    "",
    "**Breakdown**",
    lines,
    "",
    "Reply with **accept** to proceed, or tell me what to adjust (e.g. “make it comprehensive”, “driver age is 42”, “coverage amount is 500000”), or say **start over**.",
  ].join("\n");
}

export function formatQuoteDraftSummary(product: QuoteProduct, data: QuoteDataByProduct): string {
  if (product === "auto") {
    const d = data.auto;
    return [
      "**Auto quote details**",
      `- Vehicle: ${d.vehicleYear ?? "?"} ${d.make ?? "?"} ${d.model ?? "?"}`.trim(),
      `- Driver age: ${d.driverAge ?? "?"}`,
      `- Driving history: ${d.drivingHistory ?? "?"}`,
      `- Coverage level: ${d.coverageLevel ?? "?"}`,
    ].join("\n");
  }
  if (product === "home") {
    const d = data.home;
    return [
      "**Home quote details**",
      `- Property type: ${d.propertyType ?? "?"}`,
      `- Location: ${d.location ?? "?"}`,
      `- Estimated value: ${d.estimatedValue ?? "?"}`,
      `- Coverage level: ${d.coverageLevel ?? "?"}`,
    ].join("\n");
  }
  const d = data.life;
  return [
    "**Life quote details**",
    `- Age: ${d.age ?? "?"}`,
    `- Health status: ${d.healthStatus ?? "?"}`,
    `- Coverage amount: ${d.coverageAmount ?? "?"}`,
    `- Term length (years): ${d.termLengthYears ?? "?"}`,
  ].join("\n");
}

export function isRestartIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(start over|restart|reset|new quote)\b/.test(t);
}

export function isCancelIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /\b(cancel|never mind|nevermind|stop|exit|quit|forget (the )?quote|don'?t want (a )?quote|no quote)\b/.test(t);
}

export function isPauseIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /\b(finish later|save for later|pause|we'?ll do this later|do this later|later)\b/.test(t);
}

export function isDeleteDataIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /\b(delete my data|forget me|erase (my )?(data|chat)|delete this chat|remove my information)\b/.test(t);
}

export function isConfirmIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /\b(confirm|looks (right|good)|that'?s right|proceed|continue)\b/.test(t);
}

export function isEditIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /\b(go back|back|previous|edit|change|update)\b/.test(t);
}

export function isAcceptIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /\baccept\b|\blooks good\b|\bgo ahead\b|\byes\b/.test(t);
}

export function isAdjustIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /\badjust\b|\bchange\b|\bupdate\b|\bactually\b|\binstead\b/.test(t) || /\b(age|year|coverage|basic|standard|comprehensive|value|term)\b/.test(t);
}

export function isResumeIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(continue quote|continue my quote|resume|resume quote|back to (my )?quote|continue with quote)\b/.test(t);
}

export function isResumableDraft(quote: QuoteState): boolean {
  return quote.status === "inactive" && !quote.active && quote.step !== "done" && quote.product !== null;
}
