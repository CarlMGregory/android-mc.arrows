# Local Android build record

The workstation initially had JDK 20 but no Android SDK. The user explicitly
approved project-local tool downloads, then approved Google's Android SDK
License Agreement for the stable build toolchain. No emulator, preview or
unrelated vendor license was accepted.

## Provenance

| Tool | Official source | Integrity |
| --- | --- | --- |
| Temurin JDK 21.0.12.1+1, Windows x64 | Adoptium API, downloading from `adoptium/temurin21-binaries` official GitHub releases | SHA-256 verified against API metadata: `f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e` |
| Android command-line tools, archive `commandlinetools-win-16111833_latest.zip` | Google's `https://dl.google.com/android/repository/repository2-3.xml` and matching Google download | SHA-1 verified against Google's repository metadata: `57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d`; locally recorded SHA-256: `e5885e2e59038c0778a85fc19f01de7ce7c567c105553f7617b936b1e0e87b2b` |
| SDK Platform 36, build tools 35.0.0, platform tools | Official Android CLI package installation | Managed by the downloaded Google tool |

This command-line tools release deprecates `sdkmanager.bat` in favor of its
bundled `android.exe`. The installation used the documented `android sdk
install` route, with `--sdk` selecting `.local\android-sdk`. JDK, SDK, Android
user state, Gradle cache and the debug keystore are worktree-local. License
acceptance is stored inside that local SDK. Environment overrides are
process-scoped, not saved with `setx` or system configuration.

## Verification performed

- `npm test`: pure game and storage rules.
- `npm run test:e2e`: production build and Chrome UI tests, including endless
  progression past the old level 24 limit, long winding paths, forgiving nearby
  stroke selection, blocked collision/return animation, visible zoom-scaling SVG dots,
  anchored two-finger pinch, one-finger and mouse drag panning, touch, hold
  guidance, tail-following animation input locking,
  seeded restart/resume, high-level paging, save migration and disconnected
  gameplay after loading.
- `npm run android:apk`: production web build, Capacitor sync,
  `assembleDebug` and `lintDebug` using the local JDK/SDK.
- Android `apksigner verify --verbose`: debug APK v2 signature verifies.
- Android `aapt dump badging`: app ID `com.mcarrows.drift`, label
  `Drift Arrows`, version `0.1.0`, min SDK 24, target/compile SDK 36.
- APK ZIP inspection: all four production web assets match `dist`
  byte-for-byte, compiled DEX is present, and Capacitor has no remote
  server URL configured.

Output: `android\app\build\outputs\apk\debug\app-debug.apk`.
Build logs and reports are ignored local outputs. The debug APK is not
committed and is not a signed release suitable for Play Store publication.
Rebuilds may produce different APK digests.

Android lint completed without app errors. Informational warnings include
newer dependency versions and unused Capacitor template resources; the
Capacitor dependency maintains its own lint baseline. No dependency upgrades
were made solely to silence those warnings.

## Still unverified

No Android phone or emulator was used. Installation, cold launch in airplane
mode, WebView touch behavior, Android Back, audio, background/resume,
safe-area layout, large font settings and on-device persistence remain
device acceptance checks. Browser UI checks and APK inspection are not
substitutes for those checks.
