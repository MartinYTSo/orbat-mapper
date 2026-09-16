import { beforeEach, describe, expect, it, vi } from "vitest";
import { coaGenerationParameters } from "@/modules/scenarioeditor/coaGenerationParameters";

vi.mock("@/modules/scenarioeditor/coaGenerationApi", () => ({
  TRAFFIC_BATCH_SIZE: 20,
  resetCoaSession: vi.fn(async () => ({
    observation_count: 1,
    skipped_count: 0,
    skipped: [],
    step_count: 3,
    window_start: "2014-06-08T00:00:00+00:00",
    window_end: "2014-06-08T02:00:00+00:00",
    partial: false,
  })),
  extendCoaSession: vi.fn(async () => ({
    added_observations: 1,
    observation_count: 2,
    step_count: 5,
    extended_steps: 2,
    window_end: "2014-06-08T04:00:00+00:00",
    partial: false,
  })),
  stepCoaSession: vi.fn(async () => ({
    done: false,
    step_index: 1,
    step_time: "2014-06-08T00:00:00+00:00",
    mlcoa: "SPOIL",
    p_c: { SPOIL: 0.55, INTEG: 0.2, DISP: 0.15, HOLD: 0.1 },
    entropy: 1.2,
    flags: [],
    latency_ms: 12,
    report_count: 1,
    log: [{ t: "2014-06-08T00:00:00+00:00", kind: "MLCOA", message: "MLCOA SPOIL" }],
    entity_evidence: {
      hypotheses: ["SPOIL", "INTEG", "DISP", "HOLD"],
      entities: ["E1", "E2"],
      log_Z: [
        [-1000, -1003],
        [-1001, -1003],
        [-1002, -1003],
        [-1003, -1003],
      ],
      evidence: 1e-24,
      spread: [0.12, 0.03],
    },
  })),
  applyCoaFrago: vi.fn(async () => ({
    mlcoa: "INTEG",
    p_c: { SPOIL: 0.1, INTEG: 0.7, DISP: 0.15, HOLD: 0.05 },
    entropy: 1.0,
  })),
  checkCoaApiHealth: vi.fn(async () => true),
}));

vi.mock("@/modules/scenarioeditor/collectTrafficReports", () => ({
  collectTrafficReports: vi.fn(() => [
    {
      report_text: "080008Z JUN 14 CONTACTREP GR 34UFA0448841743",
      timestamp_utc: "2014-06-08T00:08:46Z",
      report_type: "CONTACTREP",
    },
  ]),
}));

vi.mock("@/modules/scenarioeditor/syncTrafficToCoaDb", () => ({
  syncTrafficToCoaDb: vi.fn(async () => ({
    scenario_id: "scenario-test",
    report_count: 1,
    updated_at: "2026-08-25T00:00:00Z",
  })),
}));

vi.mock("@/modules/scenarioeditor/collectPlottedEntities", () => ({
  collectPlottedEntities: vi.fn(() => [
    {
      entity_id: "unit-1",
      name: "142nd TANK BDET",
      timestamp_utc: "2014-06-08T01:00:00Z",
      lat: 52.1,
      lon: 21.2,
      sidc: "10031000161211000000",
      kind: "unit",
    },
  ]),
  plottedEntitiesFingerprint: vi.fn(() => "unit-1"),
}));

vi.mock("@/modules/scenarioeditor/syncPlottedEntities", () => ({
  syncPlottedEntities: vi.fn(async () => ({
    scenario_id: "scenario-test",
    entity_count: 1,
    upserted: 1,
    deleted: 0,
    session_active: false,
    added_observations: 0,
    replaced_observations: 0,
    skipped: [],
    stale: [],
    requires_reset: false,
    observation_count: 0,
    step_count: 0,
    window_end: null,
  })),
}));

describe("useCoaGenerationSession", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();
    coaGenerationParameters.value.appliedPriors = {
      SPOIL: 0.55,
      INTEG: 0.2,
      DISP: 0.15,
      HOLD: 0.1,
    };
    coaGenerationParameters.value.appliedTimeframe = { startMs: null, endMs: null };
  });

  it("syncs entities before reset without inline records or traffic extension", async () => {
    const { useCoaGenerationSession, bindCoaGenerationScenario } =
      await import("@/modules/scenarioeditor/coaGenerationSession");
    const api = await import("@/modules/scenarioeditor/coaGenerationApi");
    const entitySync = await import("@/modules/scenarioeditor/syncPlottedEntities");
    const trafficCollector =
      await import("@/modules/scenarioeditor/collectTrafficReports");
    const trafficSync = await import("@/modules/scenarioeditor/syncTrafficToCoaDb");
    bindCoaGenerationScenario({
      store: { state: { id: "scenario-test" } },
      time: { setCurrentTime: vi.fn() },
    } as never);
    const session = useCoaGenerationSession();
    await session.step();

    expect(session.snapshot.value.observationCount).toBe(1);
    expect(session.snapshot.value.stepIndex).toBe(1);
    expect(session.snapshot.value.entityEvidence?.entities).toEqual(["E1", "E2"]);
    expect(session.entityEvidenceRows.value[0].topHypothesis).toBe("SPOIL");
    expect(session.entityEvidenceRows.value[1].topShare).toBeCloseTo(0.25);
    expect(
      session.entityEvidenceRows.value[0].shares.reduce(
        (sum, share) => sum + share.value,
        0,
      ),
    ).toBeCloseTo(1);
    expect(session.logEntries.value.some((entry) => entry.kind === "MLCOA")).toBe(true);
    expect(entitySync.syncPlottedEntities).toHaveBeenCalledOnce();
    expect(api.resetCoaSession).toHaveBeenCalledWith(
      "scenario-test",
      coaGenerationParameters.value.appliedPriors,
      coaGenerationParameters.value.appliedTimeframe,
    );
    expect(
      vi.mocked(entitySync.syncPlottedEntities).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(api.resetCoaSession).mock.invocationCallOrder[0]);
    expect(api.extendCoaSession).not.toHaveBeenCalled();
    expect(trafficCollector.collectTrafficReports).not.toHaveBeenCalled();
    expect(trafficSync.syncTrafficToCoaDb).not.toHaveBeenCalled();
  });

  it("debounces plotted entity sync whenever a scenario is bound", async () => {
    vi.useFakeTimers();
    const { useCoaGenerationSession, bindCoaGenerationScenario } =
      await import("@/modules/scenarioeditor/coaGenerationSession");
    const entitySync = await import("@/modules/scenarioeditor/syncPlottedEntities");
    let mutationHandler: (() => void) | undefined;

    bindCoaGenerationScenario({
      store: {
        state: { id: "scenario-test" },
        onMutation: vi.fn((handler) => {
          mutationHandler = handler;
          return { off: vi.fn() };
        }),
      },
      time: { setCurrentTime: vi.fn() },
    } as never);

    expect(useCoaGenerationSession().sessionReady.value).toBe(false);
    mutationHandler?.();
    mutationHandler?.();
    await vi.advanceTimersByTimeAsync(599);
    expect(entitySync.syncPlottedEntities).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(entitySync.syncPlottedEntities).toHaveBeenCalledOnce();
  });

  it("does not sync plotted entities while a COA step is in flight", async () => {
    vi.useFakeTimers();
    let resolveStep: ((value: unknown) => void) | undefined;
    const api = await import("@/modules/scenarioeditor/coaGenerationApi");
    vi.mocked(api.stepCoaSession).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStep = resolve;
        }) as ReturnType<typeof api.stepCoaSession>,
    );
    const { useCoaGenerationSession, bindCoaGenerationScenario } =
      await import("@/modules/scenarioeditor/coaGenerationSession");
    const entitySync = await import("@/modules/scenarioeditor/syncPlottedEntities");
    let mutationHandler: (() => void) | undefined;

    bindCoaGenerationScenario({
      store: {
        state: { id: "scenario-test" },
        onMutation: vi.fn((handler) => {
          mutationHandler = handler;
          return { off: vi.fn() };
        }),
      },
      time: { setCurrentTime: vi.fn() },
    } as never);

    const session = useCoaGenerationSession();
    const stepping = session.step();
    await Promise.resolve();
    vi.mocked(entitySync.syncPlottedEntities).mockClear();
    mutationHandler?.();
    await vi.advanceTimersByTimeAsync(600);
    expect(entitySync.syncPlottedEntities).not.toHaveBeenCalled();

    resolveStep?.({
      done: false,
      step_index: 1,
      step_time: "2014-06-08T00:00:00+00:00",
      mlcoa: "SPOIL",
      p_c: { SPOIL: 0.55, INTEG: 0.2, DISP: 0.15, HOLD: 0.1 },
      entropy: 1.2,
      flags: [],
      latency_ms: 12,
      report_count: 1,
      log: [],
      entity_evidence: null,
    });
    await stepping;
  });

  it("syncs run belief from applied FRAGO priors through the API", async () => {
    const { useCoaGenerationSession, bindCoaGenerationScenario } =
      await import("@/modules/scenarioeditor/coaGenerationSession");
    bindCoaGenerationScenario({
      store: { state: { id: "scenario-test" } },
      time: { setCurrentTime: vi.fn() },
    } as never);
    const session = useCoaGenerationSession();
    await session.reset();
    coaGenerationParameters.value.appliedPriors.INTEG = 0.7;
    coaGenerationParameters.value.appliedPriors.SPOIL = 0.1;
    await session.syncBeliefFromFrago();

    expect(session.snapshot.value.mlcoa).toBe("INTEG");
    expect(session.snapshot.value.p_c.INTEG).toBe(0.7);
  });

  it("rebuilds the session when /step reports no live engine session", async () => {
    const { useCoaGenerationSession, bindCoaGenerationScenario } =
      await import("@/modules/scenarioeditor/coaGenerationSession");
    const api = await import("@/modules/scenarioeditor/coaGenerationApi");
    bindCoaGenerationScenario({
      store: { state: { id: "scenario-test" } },
      time: { setCurrentTime: vi.fn() },
    } as never);
    const session = useCoaGenerationSession();
    await session.step();
    expect(api.resetCoaSession).toHaveBeenCalledTimes(1);

    vi.mocked(api.stepCoaSession)
      .mockRejectedValueOnce(new Error("Call /reset before /step"))
      .mockResolvedValueOnce({
        done: false,
        step_index: 1,
        step_time: "2014-06-08T00:00:00+00:00",
        mlcoa: "SPOIL",
        p_c: { SPOIL: 0.55, INTEG: 0.2, DISP: 0.15, HOLD: 0.1 },
        entropy: 1.2,
        flags: [],
        latency_ms: 12,
        report_count: 1,
        log: [{ t: "2014-06-08T00:00:00+00:00", kind: "MLCOA", message: "MLCOA SPOIL" }],
        entity_evidence: null,
      });

    await session.step();

    expect(api.resetCoaSession).toHaveBeenCalledTimes(2);
    expect(session.snapshot.value.stepIndex).toBe(1);
    expect(
      session.logEntries.value.some((entry) =>
        entry.message.includes("no live session"),
      ),
    ).toBe(true);
  });

  it("moves the scenario clock when a step completes", async () => {
    const { useCoaGenerationSession, bindCoaGenerationScenario } =
      await import("@/modules/scenarioeditor/coaGenerationSession");
    const setCurrentTime = vi.fn();
    bindCoaGenerationScenario({
      store: { state: { id: "scenario-test" } },
      time: { setCurrentTime },
    } as never);
    const session = useCoaGenerationSession();
    await session.step();

    expect(session.snapshot.value.stepIndex).toBe(1);
    expect(setCurrentTime).toHaveBeenCalledOnce();
  });

  it("allows another step when the window is done but partial", async () => {
    const api = await import("@/modules/scenarioeditor/coaGenerationApi");
    vi.mocked(api.stepCoaSession)
      .mockResolvedValueOnce({
        done: true,
        partial: true,
        step_index: 1,
        step_time: "2014-06-08T00:00:00+00:00",
        mlcoa: "SPOIL",
        p_c: { SPOIL: 0.55, INTEG: 0.2, DISP: 0.15, HOLD: 0.1 },
        entropy: 1.2,
        flags: [],
        latency_ms: 7,
        report_count: 3,
        log: [],
        entity_evidence: null,
      })
      .mockResolvedValueOnce({
        done: false,
        partial: true,
        step_index: 1,
        step_time: "2014-06-08T01:00:00+00:00",
        mlcoa: "SPOIL",
        p_c: { SPOIL: 0.55, INTEG: 0.2, DISP: 0.15, HOLD: 0.1 },
        entropy: 1.2,
        flags: [],
        latency_ms: 8,
        report_count: 0,
        log: [],
        entity_evidence: null,
      });

    const { useCoaGenerationSession, bindCoaGenerationScenario } =
      await import("@/modules/scenarioeditor/coaGenerationSession");
    bindCoaGenerationScenario({
      store: { state: { id: "scenario-test" } },
      time: { setCurrentTime: vi.fn() },
    } as never);
    const session = useCoaGenerationSession();
    await session.step();
    expect(session.snapshot.value.done).toBe(true);
    expect(session.snapshot.value.partial).toBe(true);

    await session.step();
    expect(api.stepCoaSession).toHaveBeenCalledTimes(2);
  });
});
