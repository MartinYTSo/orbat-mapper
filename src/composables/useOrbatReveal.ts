import { inject, type Ref } from "vue";
import { breakpointsTailwind, useBreakpoints } from "@vueuse/core";
import { activeParentKey } from "@/components/injects";
import { useSelectedItems } from "@/stores/selectedStore";
import { useUiStore } from "@/stores/uiStore";
import { TAB_ORBAT } from "@/types/constants";
import type { EntityId } from "@/types/base";
import type { TScenario } from "@/scenariostore";

export function useOrbatReveal(scenario: TScenario) {
  const { unitActions } = scenario;
  const { orbatRevealUnitId, activeUnitId, selectedUnitIds } = useSelectedItems();
  const ui = useUiStore();
  const breakpoints = useBreakpoints(breakpointsTailwind);
  const isMobile = breakpoints.smallerOrEqual("md");
  const activeParentId = inject<Ref<EntityId | null | undefined> | undefined>(
    activeParentKey,
    undefined,
  );

  function revealUnitInOrbat(unitId: EntityId, options: { showLeftPanel?: boolean } = {}) {
    activeUnitId.value = unitId;
    if (activeParentId?.value !== undefined) {
      activeParentId.value = unitId;
    }
    selectedUnitIds.value.clear();
    selectedUnitIds.value.add(unitId);

    const showPanel = options.showLeftPanel !== false;
    if (showPanel && !isMobile.value) {
      ui.showLeftPanel = true;
      ui.activeTabIndex = TAB_ORBAT;
    }

    const { side, sideGroup, parents } = unitActions.getUnitHierarchy(unitId);
    if (side) side._isOpen = true;
    if (sideGroup) sideGroup._isOpen = true;
    parents.forEach((parent) => {
      parent._isOpen = true;
    });
    orbatRevealUnitId.value = unitId;
  }

  return { revealUnitInOrbat };
}
