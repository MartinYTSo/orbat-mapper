import type { PlottedEntityRecord } from "@/modules/scenarioeditor/collectPlottedEntities";

const DEFAULT_API_BASE = "/api/coa";

function apiBase() {
  return import.meta.env.VITE_COA_API_BASE ?? DEFAULT_API_BASE;
}

export interface PlottedEntitySkip {
  entity_id: string;
  reason: string;
}

export interface EntitySyncResponse {
  scenario_id: string;
  entity_count: number;
  upserted: number;
  deleted: number;
  session_active: boolean;
  added_observations: number;
  replaced_observations: number;
  skipped: PlottedEntitySkip[];
  stale: PlottedEntitySkip[];
  /** True when an entity landed on an hour the belief filter already consumed. */
  requires_reset: boolean;
  observation_count: number;
  step_count: number;
  window_end: string | null;
}

export interface EntityDeleteResponse {
  scenario_id: string;
  deleted: number;
  dropped_observations: number;
  session_active: boolean;
  requires_reset: boolean;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // keep status text
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

/**
 * Persist the plotted entities for a scenario and, when a COA session is running,
 * fold them into its belief update. `replaceAll` makes the server drop stored
 * entities that are absent from `entities`, which is how a deletion on the map
 * propagates.
 */
export async function syncPlottedEntities(
  scenarioId: string,
  entities: PlottedEntityRecord[],
  options: { replaceAll?: boolean; clampToNow?: boolean } = {},
): Promise<EntitySyncResponse> {
  return postJson<EntitySyncResponse>("/entities/sync", {
    scenario_id: scenarioId,
    entities,
    replace_all: options.replaceAll ?? true,
    clamp_to_now: options.clampToNow ?? true,
  });
}

/** Remove the named entities, or every entity for the scenario when `entityIds` is omitted. */
export async function deletePlottedEntities(
  scenarioId: string,
  entityIds?: string[],
): Promise<EntityDeleteResponse> {
  return postJson<EntityDeleteResponse>("/entities/delete", {
    scenario_id: scenarioId,
    entity_ids: entityIds ?? null,
  });
}
