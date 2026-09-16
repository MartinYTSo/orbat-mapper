# COA timeline window

COA generation can run over a user-selected time window. The window is set on the scenario timeline, not in the COA Parameters tab.

## How to set the window

1. Open **Generate COA** from the toolbar so the COA panel is visible.
2. Right-click a time on the scenario timeline.
3. Choose **Set COA window start** or **Set COA window end**.
4. To remove both markers, choose **Clear COA window**.

Times snap to the nearest quarter hour, same as other timeline interactions. Blue triangles and the highlight appear immediately — you do not need to run COA generation first.

## Timeline visuals

| Element | Appearance |
|---------|------------|
| Scenario clock | Red triangle (fixed at viewport center) |
| COA start | Blue triangle at the start time |
| COA end | Blue triangle at the end time |
| COA range | Sky-blue highlight at 80% opacity between start and end |

The highlight appears only when both start and end are set and start is before end. A single bound shows its triangle only.

## Run tab

After both bounds are set:

- **Requested window** shows the active COA range.
- If you change the window while a session is running, the Run tab warns you to **Reset** before stepping again.

## State and persistence

The window is stored in `coaGenerationParameters.appliedTimeframe` (`localStorage` key `coaGenerationParameters`):

```typescript
{ startMs: number | null; endMs: number | null }
```

`null` means an open bound (no limit on that side).

## Backend hookup

The frontend sends the window on `POST /reset`. Wire the ITDX API to honor these fields.

### Frontend

| File | Role |
|------|------|
| `src/modules/scenarioeditor/coaGenerationTimeframe.ts` | Types, validation, ISO payload helper |
| `src/modules/scenarioeditor/coaGenerationApi.ts` | `resetCoaSession()` adds `window_start` / `window_end` to the body |
| `src/modules/scenarioeditor/coaGenerationSession.ts` | Passes `appliedTimeframe` into reset; `setCoaTimeframeBound()` updates the window from the timeline |

Payload shape (ISO UTC strings, omitted when bound is open):

```json
{
  "scenario_id": "...",
  "priors": { "SPOIL": 0.55, "INTEG": 0.2, "DISP": 0.15, "HOLD": 0.1 },
  "window_start": "2014-06-08T00:00:00+00:00",
  "window_end": "2014-06-08T06:00:00+00:00"
}
```

### Backend (ITDX-2026)

1. Add optional `window_start` and `window_end` to `ResetRequest` in `engine/api.py`.
2. Filter observations in `_start_observation_session()` to the requested range.
3. Return the effective window in the reset response so the Run tab log matches server behavior.

Until the backend filters on these fields, the UI and payload are ready but the engine uses its full observation range.

## Files changed

- `src/modules/scenarioeditor/ScenarioTimeline.vue` — markers, highlight, context-menu handlers
- `src/components/TimelineContextMenu.vue` — COA start/end menu items when COA panel is open
- `src/modules/scenarioeditor/scenarioTimelineMath.ts` — `timestampToTimelineX()` for marker placement
- `src/modules/scenarioeditor/coaGenerationParameters.ts` — `appliedTimeframe` field
- `src/modules/scenarioeditor/coaGenerationSession.ts` — session wiring and stale-window flag
- `src/modules/scenarioeditor/coaGenerationApi.ts` — reset payload
- `src/modules/scenarioeditor/CoaGenerationRunTab.vue` — requested window display and stale warning
