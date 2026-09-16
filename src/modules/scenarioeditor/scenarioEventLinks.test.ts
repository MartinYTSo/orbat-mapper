import { describe, expect, it } from "vitest";
import {
  findUnitsWithStateAtHour,
  getScenarioEventLinkedUnitIds,
} from "@/modules/scenarioeditor/scenarioEventLinks";
import type { NScenarioEvent, NUnit } from "@/types/internalModels";

describe("scenarioEventLinks", () => {
  it("collects linked unit ids from where and ui actions", () => {
    const event = {
      id: "evt-1",
      title: "Contact",
      startTime: 0,
      _type: "scenario",
      where: { type: "units", units: ["unit-a"] },
      uiActions: [{ type: "FLY_TO_UNIT_LOCATION", unitId: "unit-b" }],
    } satisfies NScenarioEvent;

    expect(getScenarioEventLinkedUnitIds(event)).toEqual(["unit-a", "unit-b"]);
  });

  it("finds units with state at the rounded hour", () => {
    const hour = Date.UTC(2024, 0, 1, 10, 0);
    const unitMap = {
      "unit-a": {
        id: "unit-a",
        state: [{ t: hour + 15 * 60_000 }],
      },
      "unit-b": {
        id: "unit-b",
        state: [{ t: hour + 3_600_000 }],
      },
    } as Record<string, NUnit>;

    expect(findUnitsWithStateAtHour(unitMap, hour)).toEqual(["unit-a"]);
  });
});
