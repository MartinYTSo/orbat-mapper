import type { EntityId } from "@/types/base";
import type { NScenarioEvent, NUnit } from "@/types/internalModels";
import type { FlyToUnitLocationAction } from "@/types/scenarioModels";

export function getScenarioEventLinkedUnitIds(event: NScenarioEvent): EntityId[] {
  const ids: EntityId[] = [];
  if (event.where?.type === "units") {
    ids.push(...event.where.units);
  }
  for (const action of event.uiActions ?? []) {
    if (action.type === "FLY_TO_UNIT_LOCATION") {
      ids.push((action as FlyToUnitLocationAction).unitId);
    }
  }
  return [...new Set(ids)];
}

export function findUnitsWithStateAtHour(
  unitMap: Record<EntityId, NUnit>,
  hourTimestamp: number,
): EntityId[] {
  const ids: EntityId[] = [];
  for (const unit of Object.values(unitMap)) {
    if (!unit?.state?.length) continue;
    const hasState = unit.state.some(
      (entry) => Math.round(entry.t / 3_600_000) * 3_600_000 === hourTimestamp,
    );
    if (hasState) ids.push(unit.id);
  }
  return ids.sort();
}
