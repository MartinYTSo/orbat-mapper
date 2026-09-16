<script setup lang="ts">
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  COA_PLAYBACK_SPEEDS,
  useCoaGenerationSession,
} from "@/modules/scenarioeditor/coaGenerationSession";

const { playbackSpeed, playIntervalMs, setPlaybackSpeed } = useCoaGenerationSession();

function chooseSpeed(value: unknown) {
  if (typeof value === "number") setPlaybackSpeed(value);
}
</script>

<template>
  <div class="ml-auto flex min-w-0 flex-col items-end gap-1">
    <div class="flex items-baseline gap-2">
      <span class="text-muted-foreground text-xs whitespace-nowrap">Replay speed</span>
      <span class="text-muted-foreground font-mono text-[10px] whitespace-nowrap"
        >{{ playIntervalMs }} ms/step</span
      >
    </div>
    <ToggleGroup
      type="single"
      :disable-deselection="true"
      :model-value="playbackSpeed"
      variant="outline"
      class="grid grid-cols-4 gap-0.5"
      aria-label="Replay speed"
      @update:model-value="chooseSpeed"
    >
      <ToggleGroupItem
        v-for="speed in COA_PLAYBACK_SPEEDS"
        :key="speed"
        :value="speed"
        class="h-7 min-w-8 px-1.5 text-[10px]"
        :aria-label="`${speed} times speed`"
      >
        {{ speed }}×
      </ToggleGroupItem>
    </ToggleGroup>
  </div>
</template>
