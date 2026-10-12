# ORBAT Mapper

ORBAT Mapper is a client side web application. With ORBAT Mapper you can build order of battles (ORBATs) and plot the
locations of units on a map. You can make historic battles and military scenarios again in your browser.

**This project is work in progress.** You can try the current version at https://orbat-mapper.app/. You can read the
documentation at https://docs.orbat-mapper.app/.

_Screenshot:_

![Work in progress sample screenshot](images/screenshot-2023-09-01.png "Work in progress sample screenshot")

ORBAT Mapper is an open-source project with an MIT license. Thus, you can freely use, change and give the source code
to other persons. You must obey the conditions of the license.

You can make a fork and adapt ORBAT Mapper for your applications. But be careful, because the project changes quickly.

## Get started

Obey these steps to run ORBAT Mapper on your computer, or to make your own version of ORBAT Mapper.

Clone the repository:

    $ git clone https://github.com/orbat-mapper/orbat-mapper.git

Go to the project root:

    $ cd orbat-mapper

Install the dependencies:

    $ pnpm install

Start a development server:

    $ pnpm run dev

ORBAT Mapper now runs on http://localhost:5173/. When you change the source code, Vite sends the changes immediately to
the browser.

Make an optimized and minified build:

    $ pnpm run build

This command writes the optimized build to the `dist` directory. Then you can supply this build on your computer:

    $ pnpm run preview

Make a standalone build, that is one HTML file that runs from your disk without a web server:

    $ pnpm run build:singlefile

For the different deployment options, see https://vitejs.dev/guide/static-deploy.html.

## Shared traffic with A-GAME

ORBAT Mapper and the [Watchtower MLCOA demo](https://github.com/MartinYTSo/A-GAME)
(A-GAME, formerly ITDX-2026) share one synthetic intelligence traffic stream.
The source of truth is `scenario/traffic.jsonl` in A-GAME. Running `make traffic`
there converts it into this repository's payload:

`public/traffic_reports_payload.json`

It contains 500 map features (HUMINT, UAS, CONTACT, and related formats) for
OPERATION BULLDOG. Each feature stores report text in `description` and structured
fields (`timestamp_utc`, `report_type`, `equipment`, `mgrs`, and so on) in
`userData`.

Clone A-GAME next to this repository:

```text
Repo/
├── A-GAME/
└── martin-orbat-mapper/
```

To regenerate the payload after changing the traffic, run this from A-GAME (it
also re-seeds A-GAME's SQLite store):

```console
cd ../A-GAME
make traffic
```

Then re-import the payload into your scenario.

### Import into a scenario

After `pnpm run dev`, either:

- Open `/scenario/<scenarioId>?importTrafficReports=1` to load the bundled payload, or
- Use the scenario editor traffic-reports layer to import a JSONL file (converted to
  the same payload shape in-app).

Reports appear on the map as point features on the traffic reports layer. The
import is saved with the scenario in the browser, so you only need to do it once
per scenario.

### COA generation

Start the A-GAME COA API first, then open **COA generation** in the scenario
editor. Vite proxies `/api/coa` to `127.0.0.1:8765` during development
(`vite.config.ts`), so the connection only works under `pnpm run dev`; set
`VITE_COA_API_BASE` for other setups.

On Reset, ORBAT sends the reports from the Traffic Reports layer to the API,
starts an hourly MLCOA run, and syncs the full set into A-GAME's SQLite store
under this scenario's id. ORBAT does not read the data seeded by A-GAME's
`make traffic`; it always supplies its own map traffic.

The A-GAME API refuses to start until its SQLite store holds seeded traffic. Run
`make traffic` once before starting it, or set `ITDX_ALLOW_EMPTY_TRAFFIC=1` to
start empty and let ORBAT's Reset fill it.

**Local (no Docker):**

```console
cd ../A-GAME
uv sync --extra api
make traffic
uv run uvicorn engine.api:app --port 8765
```

**Docker:**

```console
cd ../A-GAME
docker compose build
docker compose run --rm coa-api uv run python -m scenario.seed_traffic_db --wipe
docker compose up -d
```

The seed step is needed once per Docker volume, because the image does not
include `data/traffic.db`.

Check that the API is up and loaded:

```console
curl http://127.0.0.1:8765/health
```

After you patch A-GAME API code, rebuild and recreate the container (a plain
`restart` keeps the old image):

```console
cd ../A-GAME
docker compose up --build -d
```

See the A-GAME README for logs, health checks, and stopping the stack.

## Use ORBAT Mapper without an internet connection

ORBAT Mapper is a static client side web application. It can operate without an internet connection, but you must first
tell it where to find the map data. There are three ways to do this:

1. **Self-hosted** — supply the application from your own web server, and the map data from your own tile server.
2. **Local map file** — supply the application from a web server, and read the basemap from a PMTiles archive on your
   disk.
3. **Standalone file** — run the application as one HTML file from your disk, with a PMTiles archive on your disk.

The place name search sends requests to [Photon](https://photon.komoot.io/). This function needs an internet connection
in all three cases. There is no offline replacement.

You do not have to make a build. Each release supplies `orbat-mapper-<version>.zip` for a web server, and
`orbat-mapper-standalone-<version>.html` for the standalone file. See the
[releases page](https://github.com/orbat-mapper/orbat-mapper/releases).

For the full instructions, the configuration of the basemap layers and the limits of each option, see
[Offline use](https://docs.orbat-mapper.app/guide/offline-use) in the documentation.

## The legacy OpenLayers map (deprecated)

The OpenLayers map is deprecated. Do not use it for new work. It stays available at `/scenario/<scenarioId>/legacy`, and
it reads a different file: [`public/config/mapConfig.json`](public/config/mapConfig.json). The layer types for that file
are in [`layerConfigTypes.ts`](src/geo/layerConfigTypes.ts).
