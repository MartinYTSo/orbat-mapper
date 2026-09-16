import { useActiveScenario } from "@/composables/scenarioUtils";
import { useOrbatReveal } from "@/composables/useOrbatReveal";
import { useGeoStore } from "@/stores/geoStore";
import { getScenarioEventLinkedUnitIds } from "@/modules/scenarioeditor/scenarioEventLinks";

const SCENARIO_EVENT_UNIT_PADDING: [number, number, number, number] = [
  50, 50, 50, 50,
];

export function useScenarioEvents() {
  const activeScenario = useActiveScenario();
  const {
    time: { onGoToScenarioEventEvent },
    helpers: { getUnitById },
  } = activeScenario;
  const geoStore = useGeoStore();
  const { revealUnitInOrbat } = useOrbatReveal(activeScenario);

  onGoToScenarioEventEvent(({ event }) => {
    const linkedUnitIds = getScenarioEventLinkedUnitIds(event);
    if (linkedUnitIds.length) {
      revealUnitInOrbat(linkedUnitIds[0]);
    }

    const where = event.where;
    if (!where) return;
    const { maxZoom } = where;
    if (where.type === "units") {
      const units = where.units.map((u) => getUnitById(u));
      if (units) {
        geoStore.zoomToUnits(units, {
          duration: 900,
          maxZoom,
          padding: SCENARIO_EVENT_UNIT_PADDING,
        });
      }
    } else if (where.type === "geometry") {
      geoStore.zoomToGeometry(where.geometry, { duration: 900, maxZoom });
    }
  });
  return {};
}
