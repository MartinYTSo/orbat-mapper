import dayjs from "dayjs";

/** User-selected COA calculation window (ms since epoch; null = open bound). */
export interface CoaGenerationTimeframe {
  startMs: number | null;
  endMs: number | null;
}

export const DEFAULT_COA_TIMEFRAME: CoaGenerationTimeframe = {
  startMs: null,
  endMs: null,
};

export function isCoaTimeframeConfigured(timeframe: CoaGenerationTimeframe): boolean {
  return timeframe.startMs != null || timeframe.endMs != null;
}

export function isCoaTimeframeValid(timeframe: CoaGenerationTimeframe): boolean {
  if (timeframe.startMs == null || timeframe.endMs == null) return true;
  return timeframe.startMs < timeframe.endMs;
}

export function formatCoaTimeframeBound(
  valueMs: number | null,
  formatter: (ms: number) => string,
): string {
  if (valueMs == null) return "open";
  return formatter(valueMs);
}

export function formatCoaTimeframe(
  timeframe: CoaGenerationTimeframe,
  formatter: (ms: number) => string,
): string {
  const start = formatCoaTimeframeBound(timeframe.startMs, formatter);
  const end = formatCoaTimeframeBound(timeframe.endMs, formatter);
  return `${start} → ${end}`;
}

/** ISO UTC strings for the ITDX `/reset` body once the backend accepts them. */
export function coaTimeframeToApiPayload(timeframe: CoaGenerationTimeframe): {
  window_start?: string;
  window_end?: string;
} {
  const payload: { window_start?: string; window_end?: string } = {};
  if (timeframe.startMs != null) {
    payload.window_start = dayjs(timeframe.startMs).utc().format();
  }
  if (timeframe.endMs != null) {
    payload.window_end = dayjs(timeframe.endMs).utc().format();
  }
  return payload;
}
