# Stride

Offline-first walking and running tracker. Vite web app packaged for Android with Capacitor. No accounts, no servers, no API keys, no paid services.

## What is where
- `public/store.js`: the only code that reads or writes saved data (runs, routes, shoes, profile, settings, daily steps, crash-recovery session, JSON backup).
- `public/track.js`: pure logic with unit tests: GPS fix filtering, route simplifying, elevation, pace/speed, goal percentages, goal history.
- `public/app.js`: shared UI helpers, navigation, shoes, profile, plans, theme application.
- `public/tracking.js`: step sensor, GPS and the activity engine (start, pause, finish, recovery).
- `public/screens.js`: dashboard, calendar, live activity screen, activity details with the route map, history, settings, appearance.
- `public/leaflet/`: Leaflet 1.9 (BSD-2), bundled locally for the route map.
- `plugins/capacitor-pedometer/`: copy of the free `@capgo/capacitor-pedometer` plugin (MPL-2.0) with changes marked `STRIDE CHANGE`: since-boot step total, one-shot read (`getTotalSteps`), keep-alive during an activity, and the Android 13+ notification permission request.
- `@capacitor-community/background-geolocation` (MIT): GPS with an Android foreground-service notification. It uses Google Play Services location (free, no key or billing, but the phone needs Play Services).
- `tests/app.test.cjs`: end-to-end checks in a headless DOM with SIMULATED sensor, GPS and map plugins. `src/*.test.js`: unit tests.

## Commands
    npm install
    npm test                 # unit tests (data layer, GPS/pace/goal logic)
    npm run test:smoke       # build + end-to-end checks with simulated sensors
    npm run build            # production web build into dist/
    npm run cap:sync         # build + copy into android/
    npm run apk:debug        # needs JDK 21 and the Android SDK -> android/app/build/outputs/apk/debug/app-debug.apk

## How the data works
- Steps: the phone reports a running total since boot. Stride stores the total and the time of every reading. Steps taken since the previous reading, even while the app was closed, are split across the local days they spanned in proportion to time. A lower total means a reboot. Yesterday's total is kept when the day changes. The first reading ever starts the count at 0 because the sensor has no earlier history.
- Daily distance = (steps outside recorded activities x stride) + distance of recorded activities. Activity steps are never counted twice.
- A day is "completed" when the steps goal AND the distance goal for that day are both met. Goals are stored with the date they took effect, so editing a goal never rewrites earlier days.
- Activities use GPS distance when valid GPS points exist (accuracy <= 30 m, jumps over 12 m/s and stationary drift ignored, signal gaps never bridged). Otherwise distance is estimated from steps and labelled as an estimate.
- Moving time = time between valid GPS points with speed >= 0.3 m/s (paused time excluded). Pace = moving time / distance. Speed = distance / moving time. Without GPS, moving time equals elapsed active time.
- Routes are stored per activity (simplified to 3 m tolerance) in `stride.route.<id>`. The unfinished activity is saved every few seconds and offered for recovery after a crash.

## Maps and cost
Routes are recorded and drawn on the phone; nothing is uploaded. The map background downloads tile images from `https://tile.openstreetmap.org` by default. That community server is fine for personal use with attribution, but its policy does not allow heavy or public-app use. For a public release use a provider whose terms allow it (or self-host tiles) and set it in Settings > Route map. Turning the background off still draws the route. Tile requests reveal roughly which area you view to the tile server.

## Permissions
Physical activity (steps), location (only while an activity is recording; no background-location permission), notifications (to show the "recording" notification), foreground service, internet (map tiles only).

## What is verified
- Verified by automated tests with simulated sensors: step bookkeeping, midnight handling, goals and percentages, calendar, date selection, GPS filtering, pace/speed, route storage, history, themes, persistence, recovery.
- Compiled only against stub classes (not a real Android build): the changed Java in the pedometer plugin.
- NOT verified on a real phone or in a real Android build: sensor events, background behaviour, foreground-service GPS, permission dialogs, map tiles.

## Known limits
- Phones can delay or stop apps in the background (battery optimisation). For long activities, set Stride to "Unrestricted" battery use.
- If the app is not opened for a long time, steps are attributed to days by time proportion (no hourly snapshots yet).
- Distance for walking outside recorded activities is an estimate from your stride length.
- Friends, rankings and cloud sync are not implemented. Personal data stays on the phone.
