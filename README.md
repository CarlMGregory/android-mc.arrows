# Drift Arrows

An original, small offline arrow-unblocking puzzle for Android, with a browser
version for local development. Built with TypeScript, Vite and Capacitor.
Original code, procedural levels, vector artwork and synthesized sounds; no
game source, APK contents, artwork or levels were taken from Amaze GO.

## Play locally

Requires Node.js 22.19+ (Node 24 LTS recommended) and npm.

```powershell
npm ci
npm run dev
```

Open the loopback URL printed by Vite. For a production preview:

```powershell
npm run build
npm run preview
```

The Android app bundles every game asset and needs no server or connectivity.
The browser preview needs its local server to load/reload; it is not an
installable PWA and does not cache itself for offline reloads.

## Rules

The grid uses SVG guide dots with a minimum 2.4 CSS-pixel diameter at fit,
so dots remain visible on high-density phone screens and scale up with zoom.
Arrows use randomized dark colors with at least 4.5:1 contrast against the
board. Colors remain the same on restart/resume and throughout exit animations.

- Tap on or near any part of a winding arrow. Within an 18 CSS-pixel margin
  around the strokes, the nearest arrow with a clear exit lane is preferred;
  if none can exit, the nearest blocked arrow is selected. The tolerance stays
  finger-sized when zooming. Keyboard activation selects the focused arrow exactly.
  Its head moves straight toward the edge while its tail follows its own bends,
  rather than moving the whole bent shape sideways.
  Any other arrow's occupied cell ahead of the head blocks it.
- A blocked arrow flows along its path until its head hits the nearest blocker,
  then bounces back to its original position and costs one of three hearts.
  Reduced-motion mode shows immediate feedback instead of travel.
  At zero hearts, retry the same puzzle with fresh hearts.
- Clear all arrows to unlock the next level. Levels continue endlessly, with
  no final board or fixed campaign limit. Each visit generates a fresh random puzzle.
  A perfect run means losing no hearts; hints and guidance are allowed.
- Hint highlights and gently blinks a safe arrow until the next move, with no
  currency, limit or heart penalty. Reduced-motion mode keeps the highlight steady.
  Long-press an arrow for 450 ms to reveal only its exit ray. Green means
  clear; red means blocked. Light dashed lanes keep a visible screen-space
  thickness at every zoom. Each lane disappears after two seconds; repeating
  a long-press renews that lane's timer. Any arrow exiting or hitting a blocker
  clears all lanes immediately. Holding does not tap an arrow.
  Keyboard users can focus an arrow and press G to reveal its lane.
- Restart/replay uses the same puzzle seed and geometry. Reloading or resuming
  also retains that seed, removed arrows and hearts. Selecting a level in the
  level picker, even the current one, generates a new puzzle. Only the currently
  selected attempt is retained.
- Pinch with two fingers to zoom around their midpoint.
  Zoom ranges from 50% of whole-board fit to 4x. Zooming below fit centers the
  smaller puzzle with extra room around it; swipe with one finger or scroll
  inside the board to pan. Mouse users can click-drag the zoomed board, including
  starting a drag on a path. A drag or pinch never also activates an arrow.
  Pinch inward to restore the whole-board view. Tap selection measures distance to the actual
  winding strokes, not their bounding rectangles.
- Sound is off initially. Toggle it in the header for synthesized feedback.
  Reduced-motion preferences disable movement animations.
- Use Tab and Enter/Space for keyboard controls, including help and levels.

Progress, the current attempt, sound preference and perfect runs are saved
locally. Clearing app/browser data removes them. Invalid or denied storage
shows an explicit warning; an invalid save is not overwritten unless the player
chooses **Try saving again**. There are no accounts, ads, purchases, analytics
or runtime dependencies on external services.

Grid geometry, winding-path exit rules, three hearts, free hints, and the level
sequence are **our design choices**, not verified details of the reference app.
See [the REA evidence record](docs/rea-analysis.md).

## Randomized winding puzzles

Every visit, including level 1, draws a fresh 32-bit seed. Boards vary
independently of level number: 20-40 columns, 24-50 rows, randomized path
lengths, turn frequency and filling target. Paths are self-avoiding and do
not cross other paths. The generator retries bounded deterministic variants
to require at least 25 arrows, 58% occupied cells, a path of at least 25 cells,
and a majority of bent arrows, including a path with at least five turns.
An exhausted generation budget is an explicit error, not a small-board fallback.
Every candidate that passes those quality checks also goes through an independent
geometry and dependency-graph validator. It rejects self-blocked paths, overlaps
and circular blockers and must produce a complete removal order before the
puzzle is shown. Removing an arrow only frees cells, so any legal choice
preserves solvability: two arrows cannot become mutually jammed during play.

Across a fixed 1,000-seed measurement corpus, boards contained 25-119 arrows;
the longest path on a board ranged from 25 to 104 cells. These are measured
ranges, not fixed counts or promises for every possible seed. Small pieces
remain mixed with long ones. The shape examples supplied by the user guided
the complexity and density; their layouts and artwork were not copied.

The level picker shows 24 entries per page, not a 24-level campaign. Use
Previous/Next, **Newest unlocked**, or **Go to unlocked level** to navigate
without rendering every earlier level.

Save schema 3 retains the seed and replays moves against the same generator.
Completion is stored as the highest unlocked level, rather than an array with
every completed level, so long runs do not enlarge that list.
Old straight-arrow saves keep completed levels, stars and sound preference,
but their in-progress geometry is replaced with an explicit migration notice.
Seeded winding attempts keep their exact puzzle. A saved completion of the old
24-level campaign unlocks level 25 automatically.
The existing storage key is retained so prior progress can be found.

## Verify

```powershell
npm test
npm run build
npm run test:e2e
```

Browser tests use an installed Google Chrome (`channel: chrome`), launch the
production preview, and include solving every level through the UI. If Chrome
is unavailable, install an approved browser or change the Playwright channel
to an installed Chromium-family browser. No browser or SDK is installed by
these commands.

The tests solve and validate 250 seeded boards using both reverse-insertion and
greedy removal orders, checking density, path length, turns, variation,
non-overlap, head direction and orthogonal continuity. Browser tests include
progression through levels 24-26 and onward, high-level saves/paging, seeded
restart/resume, new-puzzle visits, winding stroke hit-testing, pinch/drag/pan,
gestures, snake-like animation, save migration and
recovery, and disconnected gameplay. These browser checks do **not** verify an Android
APK or Android WebView.

## Build for Android on Windows

The checked-in `android` project uses Capacitor 8.5.3, Android Gradle Plugin
8.13.0, Gradle 8.14.3, Java 21, min SDK 24 (Android 7+), and compile/target
SDK 36. Use Android Studio 2025.2.1 or newer, its JDK 21 (or a separate
approved JDK 21), Android SDK Platform 36, compatible build tools, and platform
tools. Building downloads Gradle/Maven dependencies.

**Current workstation:** after explicit approval of local tool installation and
the Android SDK agreement, a JDK 21 and SDK Platform 36/build tools 35.0.0 were
installed under the ignored `.local` directory. No system installation or
machine-global configuration was changed. The debug APK builds successfully,
Android lint completes, its v2 signature verifies, and its bundled web assets
match `dist` byte-for-byte. **Installation and Android device/emulator testing
have not been performed.**

On this worktree, build and lint using the approved local tools:

```powershell
npm run android:apk
```

This synchronizes the web build and runs `assembleDebug lintDebug`. The
`tools\build-android.ps1` script also accepts `-JdkPath` and `-SdkPath`, restores
the caller's environment afterward, and does not install tools. Downloads,
Android/Gradle user state, and the generated debug signing key stay under
`.local`. Debug signing uses Android's public debug credentials; it is not
suitable for publishing. The preview terminal can be stopped with Ctrl+C.

In a shell with `JAVA_HOME` selecting JDK 21 and `ANDROID_HOME` selecting the
SDK (or a local, ignored `android\local.properties` with `sdk.dir`):

```powershell
npm ci
npm run android:sync
npm run android:open
```

Use Android Studio to build/run on a device or emulator. Alternatively:

```powershell
# Optional: keep Gradle downloads/cache local to this checkout.
$env:GRADLE_USER_HOME = Join-Path (Get-Location) '.local\gradle'
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location
```

The expected APK is `android\app\build\outputs\apk\debug\app-debug.apk`.
With a consenting connected test device:

```powershell
.\.local\android-sdk\platform-tools\adb.exe install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Before release, verify a cold launch in airplane mode, every control and hold
gesture on touch, Android Back behavior, background/resume, reload/persistence,
audio, safe-area/inset layout, large font settings, and portrait/landscape
WebView behavior. Signing, Play Store setup, publication and monetization are
outside this version. `com.mcarrows.drift` and the working title can be changed
before publication; no uniqueness or trademark clearance is asserted.

## Implementation

### Sideload release builds

`npm run android:release` builds and lints a non-debuggable, release-signed APK:
`android\app\build\outputs\apk\release\app-release.apk`.
Signing requires `.local\drift-release.p12` and `.local\release-signing.json`
containing `alias` and `password`. Both are private, ignored files. Never commit,
publish, or share them; retain a secure backup outside this disposable worktree.
All future updates must use this same key and an increased Android `versionCode`.
Only distribute the APK, not the signing backup.

The release uses the same app ID as the debug build but a different signing key.
Uninstall the debug app before first installing the release; uninstalling deletes
saved progress. Subsequent releases signed with the same key can update in place.
GitHub Releases may host the APK for sideloading; publishing is a separate step.

`src\engine.ts` contains pure rules and seeded procedural level construction.
Each arrow stores a head-to-tail path of adjacent grid cells. Its head ray must
be free against the existing board, and its body cannot double back across its
own ray. Reverse insertion therefore provides a solution. A seeded generator
recreates the same board without saving every coordinate.

`src\storage.ts` validates and replays saved moves against those levels;
`src\main.ts` handles accessible DOM/SVG controls, gestures and animations;
`src\paths.ts` supplies polyline geometry and the tail-following exit route;
`src\audio.ts` generates sound locally. `capacitor.config.ts` points at
`dist`, with no remote server URL.

REA is an isolated, optional research dependency under `tools\rea`, not part
of the shipped game. Its workflow and exact evidence limitations are recorded
in `docs\rea-analysis.md`.

## License

This project's original code and assets are licensed under the [MIT License](LICENSE),
copyright (c) 2026 Carl M. Gregory, MC_8. Anyone may use, modify, share, or sell them,
provided they retain the copyright and license notice in copies or substantial
portions. No separate on-screen credit is required.

Third-party dependencies retain their respective licenses. This license does
not grant rights to Amaze GO's proprietary code, assets, branding, or levels.
