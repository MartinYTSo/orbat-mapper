<script setup lang="ts">
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  IconAddCircleOutline as AddEventIcon,
  IconClockEnd,
  IconClockOutline,
  IconClockStart,
  IconZoomInOutline,
  IconZoomOutOutline,
} from "@iconify-prerendered/vue-mdi";
import { computed } from "vue";
import { coaGenerationParameters } from "@/modules/scenarioeditor/coaGenerationParameters";
import { isCoaTimeframeConfigured } from "@/modules/scenarioeditor/coaGenerationTimeframe";
import { useUiStore } from "@/stores/uiStore";

const props = defineProps<{ formattedHoveredDate: string }>();
type TimelineContextAction =
  | "zoomIn"
  | "zoomOut"
  | "addScenarioEvent"
  | "setCoaTimeframeStart"
  | "setCoaTimeframeEnd"
  | "clearCoaTimeframe";
const emit = defineEmits<{
  action: [value: TimelineContextAction];
}>();

const uiSettings = useUiStore();

const hasCoaTimeframe = computed(() =>
  isCoaTimeframeConfigured(coaGenerationParameters.value.appliedTimeframe),
);

function onContextMenuUpdate(open: boolean) {}

function onContextMenu(e: MouseEvent) {}
</script>

<template>
  <ContextMenu @update:open="onContextMenuUpdate">
    <ContextMenuTrigger as-child>
      <slot :onContextMenu="onContextMenu" />
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuLabel class="flex items-center">
        <IconClockOutline class="mr-2 size-5" />
        {{ formattedHoveredDate }}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem @select.prevent="emit('action', 'zoomIn')">
        <IconZoomInOutline class="mr-2 size-5" />
        Zoom In
      </ContextMenuItem>
      <ContextMenuItem @select.prevent="emit('action', 'zoomOut')">
        <IconZoomOutOutline class="mr-2 size-5" />
        Zoom Out
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @select="emit('action', 'addScenarioEvent')">
        <AddEventIcon class="mr-2 size-5" />
        Add scenario event
      </ContextMenuItem>
      <template v-if="uiSettings.showCoaGenerationPanel">
        <ContextMenuSeparator />
        <ContextMenuItem @select.prevent="emit('action', 'setCoaTimeframeStart')">
          <IconClockStart class="mr-2 size-5" />
          Set COA window start
        </ContextMenuItem>
        <ContextMenuItem @select.prevent="emit('action', 'setCoaTimeframeEnd')">
          <IconClockEnd class="mr-2 size-5" />
          Set COA window end
        </ContextMenuItem>
        <ContextMenuItem
          inset
          :disabled="!hasCoaTimeframe"
          @select.prevent="emit('action', 'clearCoaTimeframe')"
        >
          Clear COA window
        </ContextMenuItem>
      </template>
      <ContextMenuItem inset @select="uiSettings.showTimeline = false"
        ><span class="ml-1">Hide timeline</span></ContextMenuItem
      >
    </ContextMenuContent>
  </ContextMenu>
</template>
