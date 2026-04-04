import { describe, expect, it } from "vitest";
import {
  applyPendingField,
  autoSchema,
  computeQuote,
  detectProduct,
  extractQuoteEditsFromText,
  getMissingFields,
  homeSchema,
  isAcceptIntent,
  isAdjustIntent,
  isRestartIntent,
  isResumeIntent,
  lifeSchema,
  mergeQuoteData,
  type QuoteDataByProduct,
} from "./quote.js";

describe("quote utility behavior", () => {
  it("computes deterministic auto quote totals", () => {
    const currentYear = new Date().getFullYear();
    const result = computeQuote("auto", {
      auto: {
        vehicleYear: currentYear,
        make: "TOYOTA",
        model: "CAMRY",
        driverAge: 30,
        drivingHistory: "clean",
        coverageLevel: "standard",
      },
      home: {},
      life: {},
    });

    expect(result.monthlyPremium).toBe(71);
    expect(result.annualPremium).toBe(852);
    expect(result.currency).toBe("USD");
    expect(result.breakdown).toHaveLength(5);
  });

  it("computes deterministic home quote totals", () => {
    const result = computeQuote("home", {
      auto: {},
      home: {
        propertyType: "condo",
        location: "Austin, TX",
        estimatedValue: 300000,
        coverageLevel: "comprehensive",
      },
      life: {},
    });

    expect(result.monthlyPremium).toBe(66.5);
    expect(result.annualPremium).toBe(798);
    expect(result.breakdown).toHaveLength(3);
  });

  it("computes deterministic life quote totals", () => {
    const result = computeQuote("life", {
      auto: {},
      home: {},
      life: {
        age: 40,
        healthStatus: "good",
        coverageAmount: 250000,
        termLengthYears: 20,
      },
    });

    expect(result.monthlyPremium).toBe(87.5);
    expect(result.annualPremium).toBe(1050);
    expect(result.breakdown).toHaveLength(4);
  });

  it("enforces schema boundaries", () => {
    expect(() =>
      autoSchema.parse({
        vehicleYear: new Date().getFullYear() + 1,
        make: "X",
        model: "Y",
        driverAge: 22,
        drivingHistory: "clean",
        coverageLevel: "basic",
      })
    ).toThrow();

    expect(() =>
      homeSchema.parse({
        propertyType: "single_family",
        location: "Austin, TX",
        estimatedValue: 10000,
        coverageLevel: "standard",
      })
    ).toThrow();

    expect(() =>
      lifeSchema.parse({
        age: 17,
        healthStatus: "good",
        coverageAmount: 250000,
        termLengthYears: 20,
      })
    ).toThrow();
  });

  it("extracts product-specific edits from free text", () => {
    const edits = extractQuoteEditsFromText("2019 toyota camry, age 42, comprehensive, no accidents");
    expect(edits.auto?.vehicleYear).toBe(2019);
    expect(edits.auto?.make).toBe("TOYOTA");
    expect(edits.auto?.model).toBe("CAMRY");
    expect(edits.auto?.driverAge).toBe(42);
    expect(edits.auto?.drivingHistory).toBe("clean");
    expect(edits.auto?.coverageLevel).toBe("comprehensive");
  });

  it("applies pending field edits by product", () => {
    expect(applyPendingField("home", "estimatedValue", "350000")).toEqual({
      home: { estimatedValue: 350000 },
    });
    expect(applyPendingField("life", "termLengthYears", "30 years")).toEqual({
      life: { termLengthYears: 30 },
    });
    expect(applyPendingField("auto", "drivingHistory", "I had one accident")).toEqual({
      auto: { drivingHistory: "accident" },
    });
  });

  it("reports missing fields in required order", () => {
    const data: QuoteDataByProduct = {
      auto: { make: "Toyota" },
      home: { propertyType: "condo" },
      life: { age: 32 },
    };

    expect(getMissingFields("auto", data)).toEqual([
      "vehicleYear",
      "model",
      "driverAge",
      "drivingHistory",
      "coverageLevel",
    ]);
    expect(getMissingFields("home", data)).toEqual(["location", "estimatedValue", "coverageLevel"]);
    expect(getMissingFields("life", data)).toEqual(["healthStatus", "coverageAmount", "termLengthYears"]);
  });

  it("detects intents and product hints", () => {
    expect(detectProduct("Need car insurance quote")).toBe("auto");
    expect(detectProduct("Tell me about condo coverage")).toBe("home");
    expect(detectProduct("Need a 20 year term policy")).toBe("life");

    expect(isRestartIntent("let us start over")).toBe(true);
    expect(isAcceptIntent("yes, accept this quote")).toBe(true);
    expect(isAdjustIntent("driver age is 42 instead")).toBe(true);
    expect(isResumeIntent("continue quote")).toBe(true);
  });

  it("merges quote data shallowly by latest values", () => {
    const merged = mergeQuoteData(
      { make: "TOYOTA", model: "CAMRY" },
      { model: "CIVIC" }
    );
    expect(merged).toEqual({ make: "TOYOTA", model: "CIVIC" });
  });
});
