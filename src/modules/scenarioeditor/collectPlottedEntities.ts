import type { Geometry, Position } from "geojson";

import { TRAFFIC_REPORTS_LAYER_ID } from "@/importexport/importTrafficReports";
import type { TScenario } from "@/scenariostore";
import type { NUnit } from "@/types/internalModels";
import type { NScenarioLayerItem } from "@/types/scenarioLayerItems";
import { isScenarioOverlayLayer } from "@/types/scenarioStackLayers";

/**
 * One map entity the operator plotted, in the shape the COA API's `/entities/sync`
 * endpoint accepts. Coordinates are decimal degrees; the backend converts them to
 * MGRS and then to a belief-grid cell.
 */
export interface PlottedEntityRecord {
  entity_id: string;
  name?: string;
  timestamp_utc: string;
  lat: number;
  lon: number;
  sidc?: string;
  equipment?: string;
  activity?: string;
  report_text?: string;
  mgrs?: string;
  report_type?: string;
  source_evaluation?: string;
  evaluation?: string;
  description?: string;
  side?: string;
  kind: "unit" | "feature";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `Number.MIN_SAFE_INTEGER` is the seed sentinel for a projection with no timed state. */
function asRealTime(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value > Number.MIN_SAFE_INTEGER
    ? value
    : null;
}

/**
 * A single representative point for any geometry, as the mean of its coordinates.
 * The belief grid resolves to one cell per observation, so an area or a route
 * contributes its centre rather than every vertex.
 */
export function representativePoint(geometry: Geometry | undefined): Position | null {
  if (!geometry || geometry.type === "GeometryCollection") return null;

  let lonSum = 0;
  let latSum = 0;
  let count = 0;

  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      lonSum += value[0];
      latSum += value[1];
      count += 1;
      return;
    }
    for (const nested of value) walk(nested);
  };

  walk(geometry.coordinates);
  return count > 0 ? [lonSum / count, latSum / count] : null;
}

function unitToRecord(
  unit: NUnit,
  sideName: string | undefined,
  statusName: string | undefined,
  fallbackT: number,
) {
  const firstLocatedState = unit.state?.find((state) => state.location != null);
  const location = unit._state?.location ?? unit.location ?? firstLocatedState?.location;
  if (!location) return null;

  const userData = unit.userData ?? {};
  const firstLocatedStateT = asRealTime(firstLocatedState?.t);
  const timestamp =
    asString(userData.timestamp_utc) ??
    (firstLocatedStateT !== null
      ? new Date(firstLocatedStateT).toISOString()
      : undefined) ??
    new Date(asRealTime(unit._state?.t) ?? fallbackT).toISOString();

  return {
    entity_id: String(unit.id),
    name: unit.name,
    timestamp_utc: timestamp,
    lon: location[0],
    lat: location[1],
    sidc: unit._state?.sidc ?? unit.sidc,
    description: unit.description || undefined,
    report_text: asString(userData.report_text) ?? (unit.description || undefined),
    mgrs: asString(userData.mgrs),
    report_type: asString(userData.report_type),
    equipment: asString(userData.equipment),
    activity: asString(userData.activity) ?? statusName,
    source_evaluation: asString(userData.source_evaluation),
    evaluation: asString(userData.evaluation),
    side: sideName,
    kind: "unit",
  } satisfies PlottedEntityRecord;
}

function featureToRecord(item: NScenarioLayerItem, fallbackT: number) {
  if (item.kind !== "geometry") return null;

  const geometry = item._state?.geometry ?? item.geometry;
  const point = representativePoint(geometry);
  if (!point) return null;

  const userData = item.userData ?? {};
  const t = asRealTime(item._state?.t) ?? asRealTime(item.visibleFromT) ?? fallbackT;

  return {
    entity_id: String(item.id),
    name: item.name,
    timestamp_utc: asString(userData.timestamp_utc) ?? new Date(t).toISOString(),
    lon: point[0],
    lat: point[1],
    description: item.description || undefined,
    report_text: asString(userData.report_text) ?? (item.description || undefined),
    mgrs: asString(userData.mgrs),
    report_type: asString(userData.report_type),
    equipment: asString(userData.equipment),
    activity: asString(userData.activity),
    source_evaluation: asString(userData.source_evaluation),
    evaluation: asString(userData.evaluation),
    kind: "feature",
  } satisfies PlottedEntityRecord;
}

/**
 * Every located unit and geometry feature the operator plotted. Imported traffic-report
 * units are included as entity observations; their decorative geometry layer is excluded.
 */
export function collectPlottedEntities(scenario: TScenario): PlottedEntityRecord[] {
  const state = scenario.store.state;
  const fallbackT = state.currentTime ?? Date.now();
  const records: PlottedEntityRecord[] = [];

  for (const unit of Object.values(state.unitMap ?? {})) {
    const record = unitToRecord(
      unit,
      unit._sid ? state.sideMap?.[unit._sid]?.name : undefined,
      unit.status ? state.unitStatusMap?.[unit.status]?.name : undefined,
      fallbackT,
    );
    if (record) records.push(record);
  }

  for (const layer of Object.values(state.layerStackMap ?? {})) {
    if (layer.id === TRAFFIC_REPORTS_LAYER_ID) continue;
    if (!isScenarioOverlayLayer(layer)) continue;
    for (const itemId of layer.items) {
      const item = state.layerItemMap[itemId];
      if (!item) continue;
      const record = featureToRecord(item, fallbackT);
      if (record) records.push(record);
    }
  }

  return records.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

/**
 * Cheap change detector for every field that can change the stored observation.
 * Rounding to five decimals (about a metre) keeps float noise from a re-render out
 * of the fingerprint, so an unchanged map does not trigger a sync.
 */
export function plottedEntitiesFingerprint(records: PlottedEntityRecord[]): string {
  return records
    .map((record) =>
      [
        record.entity_id,
        record.lat.toFixed(5),
        record.lon.toFixed(5),
        record.sidc ?? "",
        record.timestamp_utc,
        record.report_text ?? "",
        record.mgrs ?? "",
        record.report_type ?? "",
        record.equipment ?? "",
        record.activity ?? "",
        record.source_evaluation ?? "",
        record.evaluation ?? "",
        record.description ?? "",
        record.side ?? "",
        record.kind,
      ].join(":"),
    )
    .join("|");
}
