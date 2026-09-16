import { describe, expect, it } from "vitest";

import {
  collectPlottedEntities,
  plottedEntitiesFingerprint,
  representativePoint,
} from "@/modules/scenarioeditor/collectPlottedEntities";
import {
  TRAFFIC_REPORTS_LAYER_ID,
  TRAFFIC_REPORTS_SIDE_ID,
} from "@/importexport/importTrafficReports";
import type { TScenario } from "@/scenariostore";

const CURRENT_TIME = Date.parse("2014-06-08T03:00:00Z");

function makeScenario(overrides: Record<string, unknown> = {}) {
  return {
    store: {
      state: {
        id: "scenario-test",
        currentTime: CURRENT_TIME,
        unitMap: {},
        sideMap: {},
        unitStatusMap: {},
        layerStackMap: {},
        layerItemMap: {},
        ...overrides,
      },
    },
  } as unknown as TScenario;
}

describe("representativePoint", () => {
  it("returns a point geometry's own coordinates", () => {
    expect(representativePoint({ type: "Point", coordinates: [21.2, 52.1] })).toEqual([
      21.2, 52.1,
    ]);
  });

  it("averages the vertices of a polygon", () => {
    const point = representativePoint({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
        ],
      ],
    });
    expect(point).toEqual([1, 1]);
  });

  it("returns null for a geometry collection", () => {
    expect(
      representativePoint({ type: "GeometryCollection", geometries: [] }),
    ).toBeNull();
  });
});

describe("collectPlottedEntities", () => {
  it("collects a located unit with its side and status name", () => {
    const scenario = makeScenario({
      unitMap: {
        "unit-1": {
          id: "unit-1",
          name: "142nd TANK BDET",
          sidc: "10031000161211000000",
          description: "Lead battalion",
          status: "status-1",
          subUnits: [],
          _sid: "side-red",
          _state: { t: Date.parse("2014-06-08T02:00:00Z"), location: [21.2, 52.1] },
        },
      },
      sideMap: { "side-red": { id: "side-red", name: "Red" } },
      unitStatusMap: { "status-1": { id: "status-1", name: "Moving" } },
    });

    expect(collectPlottedEntities(scenario)).toEqual([
      {
        entity_id: "unit-1",
        name: "142nd TANK BDET",
        timestamp_utc: "2014-06-08T02:00:00.000Z",
        lon: 21.2,
        lat: 52.1,
        sidc: "10031000161211000000",
        description: "Lead battalion",
        report_text: "Lead battalion",
        mgrs: undefined,
        report_type: undefined,
        equipment: undefined,
        activity: "Moving",
        source_evaluation: undefined,
        evaluation: undefined,
        side: "Red",
        kind: "unit",
      },
    ]);
  });

  it("includes a time-gated traffic unit with its report metadata", () => {
    const scenario = makeScenario({
      unitMap: {
        "no-location": { id: "no-location", name: "Unplotted", subUnits: [] },
        "traffic-unit": {
          id: "traffic-unit",
          name: "Report marker",
          sidc: "10041000001205000000",
          description: "Observed tracked vehicles",
          subUnits: [],
          _sid: TRAFFIC_REPORTS_SIDE_ID,
          state: [
            {
              id: "traffic-unit-t0",
              t: Date.parse("2014-06-08T00:30:00Z"),
              location: [21, 52],
            },
            {
              id: "traffic-unit-t1",
              t: Date.parse("2014-06-08T01:30:00Z"),
              location: null,
            },
          ],
          _state: { t: CURRENT_TIME, location: null },
          userData: {
            timestamp_utc: "2014-06-08T00:28:58Z",
            report_text: "Observed tracked vehicles",
            mgrs: "34UFA1234567890",
            report_type: "SPOTREP",
            equipment: "BMP-2",
            activity: "MOVING",
            source_evaluation: "B2",
          },
        },
      },
      sideMap: {
        [TRAFFIC_REPORTS_SIDE_ID]: {
          id: TRAFFIC_REPORTS_SIDE_ID,
          name: "Traffic Reports",
        },
      },
    });

    expect(collectPlottedEntities(scenario)).toEqual([
      {
        entity_id: "traffic-unit",
        name: "Report marker",
        timestamp_utc: "2014-06-08T00:28:58Z",
        lon: 21,
        lat: 52,
        sidc: "10041000001205000000",
        description: "Observed tracked vehicles",
        report_text: "Observed tracked vehicles",
        mgrs: "34UFA1234567890",
        report_type: "SPOTREP",
        equipment: "BMP-2",
        activity: "MOVING",
        source_evaluation: "B2",
        evaluation: undefined,
        side: "Traffic Reports",
        kind: "unit",
      },
    ]);
  });

  it("collects geometry features and ignores the traffic reports layer", () => {
    const scenario = makeScenario({
      layerStackMap: {
        "layer-1": { id: "layer-1", kind: "overlay", name: "Plots", items: ["f-1"] },
        [TRAFFIC_REPORTS_LAYER_ID]: {
          id: TRAFFIC_REPORTS_LAYER_ID,
          kind: "overlay",
          name: "Traffic Reports",
          items: ["f-traffic"],
        },
      },
      layerItemMap: {
        "f-1": {
          id: "f-1",
          kind: "geometry",
          name: "Suspected assembly area",
          geometry: { type: "Point", coordinates: [21.5, 52.4] },
          visibleFromT: Date.parse("2014-06-08T01:00:00Z"),
          userData: { report_type: "IMINT", activity: "DIGGING" },
        },
        "f-traffic": {
          id: "f-traffic",
          kind: "geometry",
          name: "HUMINT report",
          geometry: { type: "Point", coordinates: [21.9, 52.9] },
        },
      },
    });

    expect(collectPlottedEntities(scenario)).toEqual([
      {
        entity_id: "f-1",
        name: "Suspected assembly area",
        timestamp_utc: "2014-06-08T01:00:00.000Z",
        lon: 21.5,
        lat: 52.4,
        description: undefined,
        report_text: undefined,
        mgrs: undefined,
        report_type: "IMINT",
        equipment: undefined,
        activity: "DIGGING",
        source_evaluation: undefined,
        evaluation: undefined,
        kind: "feature",
      },
    ]);
  });

  it("falls back to the scenario current time when an item has no timed state", () => {
    const scenario = makeScenario({
      unitMap: {
        "unit-1": {
          id: "unit-1",
          name: "Unit",
          subUnits: [],
          location: [21, 52],
          _state: { t: Number.MIN_SAFE_INTEGER, location: [21, 52] },
        },
      },
    });

    expect(collectPlottedEntities(scenario)[0].timestamp_utc).toBe(
      new Date(CURRENT_TIME).toISOString(),
    );
  });
});

describe("plottedEntitiesFingerprint", () => {
  const entity = {
    entity_id: "unit-1",
    timestamp_utc: "2014-06-08T02:00:00.000Z",
    lat: 52.1,
    lon: 21.2,
    kind: "unit" as const,
  };

  it("ignores sub-metre float noise", () => {
    expect(plottedEntitiesFingerprint([entity])).toBe(
      plottedEntitiesFingerprint([{ ...entity, lat: 52.1000001 }]),
    );
  });

  it("changes when an entity moves", () => {
    expect(plottedEntitiesFingerprint([entity])).not.toBe(
      plottedEntitiesFingerprint([{ ...entity, lat: 52.2 }]),
    );
  });
});
