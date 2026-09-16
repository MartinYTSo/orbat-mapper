import { computed, ref } from "vue";
import { useIntervalFn, useLocalStorage } from "@vueuse/core";
import dayjs from "dayjs";

import type { TScenario } from "@/scenariostore";
import {
  applyCoaFrago,
  resetCoaSession,
  stepCoaSession,
  type CoaApiLogEntry,
  type CoaResetResponse,
  type EntityEvidence,
} from "@/modules/scenarioeditor/coaGenerationApi";
import {
  collectPlottedEntities,
  plottedEntitiesFingerprint,
} from "@/modules/scenarioeditor/collectPlottedEntities";
import { syncPlottedEntities } from "@/modules/scenarioeditor/syncPlottedEntities";
import {
  COA_HYPOTHESIS_NAMES,
  coaGenerationParameters,
  type CoaHypothesisName,
  type CoaHypothesisPriors,
} from "@/modules/scenarioeditor/coaGenerationParameters";
import {
  formatCoaTimeframe,
  isCoaTimeframeConfigured,
} from "@/modules/scenarioeditor/coaGenerationTimeframe";
import { useTimeFormatStore } from "@/stores/timeFormatStore";

export type CoaLogKind = "REPORT" | "MLCOA" | "DISPOSITION" | "FLAG" | "LATENCY" | "INFO";

export interface CoaLogEntry {
  id: string;
  t: string;
  kind: CoaLogKind;
  message: string;
}

export interface CoaRunSnapshot {
  stepIndex: number;
  stepLabel: string;
  stepTime: string | null;
  mlcoa: CoaHypothesisName | null;
  p_c: CoaHypothesisPriors;
  entropy: number | null;
  flags: string[];
  done: boolean;
  /** More observations exist in storage beyond the current batch. */
  partial: boolean;
  observationCount: number;
  skippedCount: number;
  stepCount: number;
  entityEvidence: (EntityEvidence & { stepLabel: string }) | null;
}

export interface EntityEvidenceRow {
  entity: string;
  shares: { hypothesis: string; value: number }[];
  topHypothesis: string;
  topShare: number;
  spread: number;
}

export function toEntityEvidenceRows(evidence: EntityEvidence): EntityEvidenceRow[] {
  return evidence.entities.map((entity, entityIndex) => {
    const logValues = evidence.hypotheses.map(
      (_, hypothesisIndex) => evidence.log_Z[hypothesisIndex]?.[entityIndex] ?? -Infinity,
    );
    const maxLog = Math.max(...logValues);
    const weights = logValues.map((value) => Math.exp(value - maxLog));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const shares = evidence.hypotheses.map((hypothesis, hypothesisIndex) => ({
      hypothesis,
      value: weights[hypothesisIndex] / total,
    }));
    const top = shares.reduce((best, share) => (share.value > best.value ? share : best));

    return {
      entity,
      shares,
      topHypothesis: top.hypothesis,
      topShare: top.value,
      spread: evidence.spread[entityIndex] ?? 0,
    };
  });
}

const BASE_PLAY_INTERVAL_MS = 350;

/** Replay speed multipliers offered on the Run tab; interval = base / speed. */
export const COA_PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;

export type CoaPlaybackSpeed = (typeof COA_PLAYBACK_SPEEDS)[number];

let logCounter = 0;
let scenarioRef: TScenario | null = null;

function nextLogId() {
  logCounter += 1;
  return `coa-log-${logCounter}`;
}

function defaultSnapshot(): CoaRunSnapshot {
  return {
    stepIndex: 0,
    stepLabel: "Not started",
    stepTime: null,
    mlcoa: null,
    p_c: { ...coaGenerationParameters.value.appliedPriors },
    entropy: null,
    flags: [],
    done: false,
    partial: false,
    observationCount: 0,
    skippedCount: 0,
    stepCount: 0,
    entityEvidence: null,
  };
}

const snapshot = ref<CoaRunSnapshot>(defaultSnapshot());
const logEntries = ref<CoaLogEntry[]>([]);
const playing = ref(false);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const sessionReady = ref(false);
const entitySyncing = ref(false);
const plottedEntityCount = ref(0);
const lastEntityFingerprint = ref<string | null>(null);
/** Set when a plotted entity landed on an hour the filter already consumed. */
const requiresReset = ref(false);
/** Set when applied timeframe changes while a session is already initialized. */
const timeframeStale = ref(false);
let stopEntityWatcher: (() => void) | null = null;
let entitySyncTimer: ReturnType<typeof setTimeout> | undefined;

const ENTITY_SYNC_DEBOUNCE_MS = 600;

const playbackSpeed = useLocalStorage<CoaPlaybackSpeed>("coaPlaybackSpeed", 1);

const playIntervalMs = computed(() => {
  const speed = COA_PLAYBACK_SPEEDS.includes(playbackSpeed.value)
    ? playbackSpeed.value
    : 1;
  return Math.round(BASE_PLAY_INTERVAL_MS / speed);
});

function setPlaybackSpeed(speed: number) {
  const match = COA_PLAYBACK_SPEEDS.find((value) => value === speed);
  if (match) playbackSpeed.value = match;
}

export const coaGenerationActiveTab = useLocalStorage("coaGenerationActiveTab", "0");

export function bindCoaGenerationScenario(scenario: TScenario) {
  scenarioRef = scenario;
  stopEntityWatcher?.();
  stopEntityWatcher = null;
  if (entitySyncTimer) {
    clearTimeout(entitySyncTimer);
    entitySyncTimer = undefined;
  }
  lastEntityFingerprint.value = null;

  // Every scenario edit bumps the store revision, so one subscription covers plotting,
  // moving, re-symbolizing, and deleting without watching each map interaction.
  const subscription = scenario.store?.onMutation?.(scheduleEntitySync);
  if (subscription) stopEntityWatcher = () => subscription.off();
}

function scheduleEntitySync() {
  if (!scenarioRef) return;
  // Clock updates during /step and playback are not plot edits. Syncing 300+
  // entities on every hour blocks the single API worker, so the next /step never starts.
  if (playing.value || loading.value) return;
  if (entitySyncTimer) clearTimeout(entitySyncTimer);
  entitySyncTimer = setTimeout(() => {
    entitySyncTimer = undefined;
    void syncPlottedEntitiesNow();
  }, ENTITY_SYNC_DEBOUNCE_MS);
}

function appendLog(kind: CoaLogKind, message: string, t?: string) {
  logEntries.value.push({
    id: nextLogId(),
    kind,
    t: t ?? snapshot.value.stepLabel,
    message,
  });
}

function appendApiLog(entries: CoaApiLogEntry[]) {
  for (const entry of entries) {
    appendLog(entry.kind, entry.message, formatApiTime(entry.t));
  }
}

function formatApiTime(value: string) {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD HHmm[Z]") : value;
}

function applyStepResponse(response: Awaited<ReturnType<typeof stepCoaSession>>) {
  const stepLabel = formatApiTime(response.step_time);
  snapshot.value = {
    ...snapshot.value,
    stepIndex: response.step_index,
    stepLabel,
    stepTime: response.step_time,
    mlcoa: response.mlcoa as CoaHypothesisName,
    p_c: response.p_c,
    entropy: response.entropy,
    flags: response.flags,
    done: response.done,
    partial: response.partial ?? false,
    entityEvidence: response.entity_evidence
      ? { ...response.entity_evidence, stepLabel }
      : snapshot.value.entityEvidence,
  };
  syncScenarioClock(response.step_time);
  appendApiLog(response.log);
  if (response.done && response.partial) {
    appendLog(
      "INFO",
      "Current batch finished — click Step again to load the next observation batch.",
    );
  }
}

function syncScenarioClock(stepTime: string | null) {
  if (!scenarioRef || !stepTime) return;
  scenarioRef.time.setCurrentTime(dayjs(stepTime).valueOf());
}

function applyResetResponse(response: CoaResetResponse) {
  snapshot.value = {
    ...snapshot.value,
    stepIndex: 0,
    stepLabel: "Ready",
    stepTime: response.window_start,
    observationCount: response.observation_count,
    skippedCount: response.skipped_count,
    stepCount: response.step_count,
    done: false,
    partial: response.partial ?? false,
  };
  sessionReady.value = true;
  timeframeStale.value = false;
  appendLog(
    "INFO",
    `Loaded ${response.observation_count} traffic reports (${response.skipped_count} skipped). ` +
      `Window ${formatApiTime(response.window_start)} → ${formatApiTime(response.window_end)}; ` +
      `${response.step_count} hourly steps.`,
    "INIT",
  );
  const appliedTimeframe = coaGenerationParameters.value.appliedTimeframe;
  if (isCoaTimeframeConfigured(appliedTimeframe)) {
    const tm = useTimeFormatStore();
    appendLog(
      "INFO",
      `Requested COA timeframe: ${formatCoaTimeframe(appliedTimeframe, (ms) =>
        tm.scenarioFormatter.format(ms),
      )}.`,
      "INIT",
    );
  }
  if (response.skipped_count > 0) {
    appendLog(
      "INFO",
      `Skipped ${response.skipped_count} off-map or unparseable reports.`,
      "INIT",
    );
  }
  if (response.partial) {
    appendLog(
      "INFO",
      "Loaded the first observation batch. More load in batches of 30 as you step.",
      "INIT",
    );
  }
}

/**
 * Push every plotted unit and feature to the COA API. When a session is running the
 * server folds them into the belief update, so a newly plotted entity influences the
 * next step without discarding belief state.
 */
async function syncPlottedEntitiesNow(options: { force?: boolean } = {}) {
  if (!scenarioRef) return null;

  const entities = collectPlottedEntities(scenarioRef);
  const fingerprint = plottedEntitiesFingerprint(entities);
  if (!options.force && fingerprint === lastEntityFingerprint.value) return null;

  entitySyncing.value = true;
  try {
    const response = await syncPlottedEntities(scenarioRef.store.state.id, entities, {
      replaceAll: true,
    });
    lastEntityFingerprint.value = fingerprint;
    plottedEntityCount.value = response.entity_count;
    if (response.requires_reset) requiresReset.value = true;

    if (response.session_active) {
      snapshot.value = {
        ...snapshot.value,
        observationCount: response.observation_count,
        stepCount: response.step_count,
      };
      const changed =
        response.added_observations + response.replaced_observations + response.deleted;
      if (changed > 0) {
        appendLog(
          "REPORT",
          `Plotted entities: ${response.added_observations} added, ` +
            `${response.replaced_observations} updated, ${response.deleted} removed ` +
            `(${response.entity_count} on map).`,
        );
      }
      if (response.stale.length) {
        appendLog(
          "INFO",
          `${response.stale.length} plotted entities fall before the current step — reset to fold them in.`,
        );
      }
    }
    if (response.skipped.length) {
      appendLog(
        "INFO",
        `${response.skipped.length} plotted entities were skipped (off-map or unconvertible).`,
      );
    }
    return response;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    appendLog("INFO", `Plotted entity sync failed: ${errorMessage.value}`, "ERROR");
    return null;
  } finally {
    entitySyncing.value = false;
  }
}

async function ensureSessionInitialized(force = false) {
  if (!scenarioRef) {
    throw new Error("Open a scenario before running COA generation.");
  }
  if (sessionReady.value && !force) return;

  const plottedEntities = collectPlottedEntities(scenarioRef);
  if (!plottedEntities.length) {
    throw new Error(
      "No plotted entities found. Import traffic reports or plot a unit or feature on the map.",
    );
  }

  // Persist before /reset because SQLite observations are the session's only input.
  const syncResponse = await syncPlottedEntitiesNow({ force: true });
  if (!syncResponse) {
    throw new Error(errorMessage.value ?? "Could not persist plotted entities.");
  }

  const response = await resetCoaSession(
    scenarioRef.store.state.id,
    coaGenerationParameters.value.appliedPriors,
    coaGenerationParameters.value.appliedTimeframe,
  );
  logEntries.value = [];
  applyResetResponse(response);
}

async function runStep() {
  const response = await stepCoaSession();
  applyStepResponse(response);
}

function isStaleCoaSession(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /call \/reset before/i.test(message);
}

function canAdvanceSession() {
  return !snapshot.value.done || snapshot.value.partial;
}

async function step() {
  if (!canAdvanceSession()) return;
  loading.value = true;
  errorMessage.value = null;
  try {
    await ensureSessionInitialized();
    try {
      await runStep();
    } catch (error) {
      if (!isStaleCoaSession(error)) throw error;
      sessionReady.value = false;
      await ensureSessionInitialized(true);
      appendLog(
        "INFO",
        "COA engine had no live session — calling /reset and retrying the step.",
        "INIT",
      );
      await runStep();
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    appendLog("INFO", errorMessage.value, "ERROR");
  } finally {
    loading.value = false;
  }
}

async function reset() {
  pause();
  loading.value = true;
  errorMessage.value = null;
  try {
    sessionReady.value = false;
    lastEntityFingerprint.value = null;
    requiresReset.value = false;
    snapshot.value = defaultSnapshot();
    logEntries.value = [];
    await ensureSessionInitialized(true);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    appendLog("INFO", errorMessage.value, "ERROR");
  } finally {
    loading.value = false;
  }
}

function pause() {
  playing.value = false;
  pauseInterval();
  syncScenarioClock(snapshot.value.stepTime);
}

async function togglePlay() {
  if (playing.value) {
    pause();
    return;
  }
  if (!canAdvanceSession()) return;
  playing.value = true;
  try {
    await ensureSessionInitialized();
    resumeInterval();
  } catch (error) {
    playing.value = false;
    errorMessage.value = error instanceof Error ? error.message : String(error);
    appendLog("INFO", errorMessage.value, "ERROR");
  }
}

const { pause: pauseInterval, resume: resumeInterval } = useIntervalFn(
  () => {
    // At faster speeds the tick can outrun a step still waiting on the API.
    if (loading.value) return;
    void step().then(() => {
      if (!canAdvanceSession()) pause();
    });
  },
  playIntervalMs,
  { immediate: false },
);

function setCoaTimeframeBound(bound: "startMs" | "endMs", valueMs: number) {
  coaGenerationParameters.value = {
    ...coaGenerationParameters.value,
    appliedTimeframe: {
      ...coaGenerationParameters.value.appliedTimeframe,
      [bound]: valueMs,
    },
  };

  if (sessionReady.value) {
    timeframeStale.value = true;
    const tm = useTimeFormatStore();
    appendLog(
      "INFO",
      `COA ${bound === "startMs" ? "start" : "end"} set to ${tm.scenarioFormatter.format(valueMs)}. Reset to run within the new window.`,
      snapshot.value.stepLabel,
    );
  }
}

function clearCoaTimeframe() {
  coaGenerationParameters.value = {
    ...coaGenerationParameters.value,
    appliedTimeframe: { startMs: null, endMs: null },
  };

  if (sessionReady.value) {
    timeframeStale.value = true;
    appendLog(
      "INFO",
      "COA window cleared — reset to use all observations.",
      snapshot.value.stepLabel,
    );
  }
}

async function syncBeliefFromFrago() {
  snapshot.value = {
    ...snapshot.value,
    p_c: { ...coaGenerationParameters.value.appliedPriors },
    mlcoa: COA_HYPOTHESIS_NAMES.reduce((best, name) =>
      coaGenerationParameters.value.appliedPriors[name] >
      coaGenerationParameters.value.appliedPriors[best]
        ? name
        : best,
    ),
  };

  if (!sessionReady.value) return;

  try {
    const response = await applyCoaFrago(coaGenerationParameters.value.appliedPriors);
    snapshot.value = {
      ...snapshot.value,
      mlcoa: response.mlcoa as CoaHypothesisName,
      p_c: response.p_c,
      entropy: response.entropy,
    };
    appendLog(
      "INFO",
      `FRAGO applied — MLCOA ${response.mlcoa}, entropy ${response.entropy.toFixed(2)} bits.`,
      snapshot.value.stepLabel,
    );
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    appendLog("INFO", errorMessage.value, "ERROR");
  }
}

const sortedLogEntries = computed(() => [...logEntries.value].reverse());

const ranking = computed(() =>
  COA_HYPOTHESIS_NAMES.map((name) => ({
    name,
    value: snapshot.value.p_c[name],
  })).sort((a, b) => b.value - a.value),
);

const entityEvidenceRows = computed(() =>
  snapshot.value.entityEvidence
    ? toEntityEvidenceRows(snapshot.value.entityEvidence)
    : [],
);

export function useCoaGenerationSession() {
  return {
    snapshot,
    logEntries,
    sortedLogEntries,
    ranking,
    entityEvidenceRows,
    playing,
    loading,
    errorMessage,
    sessionReady,
    entitySyncing,
    plottedEntityCount,
    requiresReset,
    timeframeStale,
    playbackSpeed,
    playIntervalMs,
    setPlaybackSpeed,
    step,
    reset,
    togglePlay,
    pause,
    appendLog,
    setCoaTimeframeBound,
    clearCoaTimeframe,
    syncBeliefFromFrago,
    syncPlottedEntitiesNow,
  };
}
