import { describe, expect, it } from "vitest";
import {
  coaTimeframeToApiPayload,
  formatCoaTimeframe,
  isCoaTimeframeConfigured,
  isCoaTimeframeValid,
} from "@/modules/scenarioeditor/coaGenerationTimeframe";

describe("coaGenerationTimeframe", () => {
  it("treats open bounds as valid", () => {
    expect(isCoaTimeframeValid({ startMs: null, endMs: null })).toBe(true);
    expect(isCoaTimeframeValid({ startMs: 100, endMs: null })).toBe(true);
    expect(isCoaTimeframeValid({ startMs: null, endMs: 200 })).toBe(true);
  });

  it("rejects start after end", () => {
    expect(isCoaTimeframeValid({ startMs: 200, endMs: 100 })).toBe(false);
  });

  it("formats open bounds", () => {
    expect(
      formatCoaTimeframe({ startMs: 1000, endMs: null }, (ms) => `t:${ms}`),
    ).toBe("t:1000 → open");
  });

  it("maps configured bounds to API payload", () => {
    expect(
      coaTimeframeToApiPayload({
        startMs: Date.parse("2014-06-08T00:00:00Z"),
        endMs: Date.parse("2014-06-08T06:00:00Z"),
      }),
    ).toEqual({
      window_start: "2014-06-08T00:00:00Z",
      window_end: "2014-06-08T06:00:00Z",
    });
    expect(coaTimeframeToApiPayload({ startMs: null, endMs: null })).toEqual({});
  });

  it("detects configured windows", () => {
    expect(isCoaTimeframeConfigured({ startMs: null, endMs: null })).toBe(false);
    expect(isCoaTimeframeConfigured({ startMs: 1, endMs: null })).toBe(true);
  });
});
