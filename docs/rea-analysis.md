# REA analysis and independent implementation boundary

## Scope and source

Reference listing:
<https://play.google.com/store/apps/details?id=com.oakever.arrows&hl=en_US>

Official REA: <https://github.com/morluto/rea>, MIT licensed, npm package
`rea-agents`. The package used here was **6.5.0**, pinned with its lockfile in
`tools\rea`. Installation used `--ignore-scripts`; no REA setup, global install,
agent registration or machine-global configuration change was performed.

The current official README, installation guide, Android analysis guide and
browser observation guide were read before use:

- <https://github.com/morluto/rea/blob/main/README.md>
- <https://github.com/morluto/rea/blob/main/docs/installation.md>
- <https://github.com/morluto/rea/blob/main/docs/android-analysis.md>
- <https://github.com/morluto/rea/blob/main/docs/browser-observation.md>

Android static analysis requires a supplied APK, full JDK 17+, and the
documented pinned JADX engine. Windows x64 additionally needs the matching REA
native controls; older packages may not support that route. REA does not supply
an Android SDK, emulator, JDK, or device. None of those analysis inputs was
supplied here, so **no APK, bytecode, resources, native libraries or game
runtime were analyzed**.

## Actual REA operation

`tools\observe-listing.mjs` launches an isolated Playwright-owned Chrome with
loopback-only CDP on port 9347, opens the public listing, and opens its
"About this game" dialog using ordinary browser interaction. REA then performs
`list-browser-targets` and `inspect-web-page`, explicitly including
accessibility text. REA itself passively observes the selected listing page.
The script closes its browser in `finally`.

Completed capture:

| Field | Value |
| --- | --- |
| REA operation | `inspect_web_page` |
| Provider | `rea-cdp-browser`, version 2 |
| Browser | Chrome 155 on Windows |
| Capture window | 2026-10-16T20:59:26.281Z to 20:59:29.017Z |
| Requested observation | 1000 ms |
| Evidence ID | `ev_78ef7625884d32d65a47025afe965c59d66884407d5211c081760fb01b181b0f` |
| Saved JSON SHA-256 | `5e01b97d78f0c289da39cd52a69dce1fa095bc6b3dd3422d7f3b63356848b851` |
| Coverage | `policy_filtered`, with `attach_limited`; no reported truncated or unavailable sections |

Raw output is retained locally, not committed:
`.local\rea-evidence\targets.json` and `.local\rea-evidence\listing.json`.
They can include unrelated public page material, so only the relevant
paraphrased findings and capture provenance are documented here.

## Findings used to define the playable scope

These are **observed listing claims**, not independently verified app behavior.
Node IDs refer to the accessibility inventory in the recorded Evidence and
will differ on a new capture.

| Listing claim, paraphrased | Accessibility node | Implementation response |
| --- | --- | --- |
| Offline play is advertised | 1997 | Bundle game code, levels, vector art and synthesized audio in Android |
| Choose an arrow with an unobstructed route to the edge | 2007 | Occupancy-based exit-ray rule |
| A hold gesture offers directional guidance | 2013 | Long-press individual arrows to retain their lanes until the next move; keyboard G equivalent |
| Incorrect taps consume a level heart | 2015 | Three hearts per attempt, then replay |
| Clearing the board completes a level; perfect runs are encouraged | 2017 | Completion/progression and no-hearts-lost star |
| Hints help identify a move | 2019 | Highlight one currently removable arrow |

This analysis influenced the game's rules, input handling, offline packaging,
and acceptance tests. It did not recover an algorithm or reproduce hidden
implementation details.

## Unknowns and original decisions

Exact board geometry, curved/straight path semantics, level data, collision
details, heart count, hint economy, animations, scoring, advertising and
progression were not verified by REA. The user subsequently supplied two
screenshots showing long multi-bend arrows, dense boards and varied sizes,
and explicitly requested fresh randomness per level visit with stable
restart/resume. Those screenshots are visual references, not gameplay evidence
and not REA output. No screenshot layout or artwork was incorporated into the
game.

Our current design uses original self-avoiding winding paths on randomized
20-40 by 24-50 grids, endless randomized levels, unlimited free hints, three
hearts, original muted artwork/branding and a locally stored seeded attempt.
The head's forward ray controls removability; on removal, the tail follows its
existing path before exiting along that ray. This animation and rule remain
independent implementation choices, not confirmed reference-game semantics.

REA's `observed` confidence applies to the public web observation, not the
truth of the listing or equivalence with the Android game. The capture is
origin-filtered; earlier network/console activity is unavailable. Script
sources, response bodies, cookies and storage values were not requested.
The tool reported unknown target attachment state and no observed host
platform/architecture. No app authenticity, signature or runtime validation
is implied.

A gameplay recording or access to a legitimately installed game would still
be needed to verify movement and interaction fidelity beyond the supplied
static screenshots. Any future
binary investigation requires legitimate input and an explicit appropriate
scope. Do not obtain APKs from untrusted mirrors, bypass protections, or copy
proprietary code/assets. This is an independent implementation, not a formally
isolated clean-room reconstruction.

## Repeat the public observation

Requires installed Chrome, a free loopback port 9347, and Node compatible with
REA (22.19+ on the 22.x line, 24.11+ on 24.x, or 26+).

```powershell
npm ci
npm ci --prefix tools\rea --ignore-scripts
node tools\observe-listing.mjs
Get-FileHash .local\rea-evidence\listing.json -Algorithm SHA256
```

Re-running replaces the ignored raw capture; preserve it first if comparing
runs. Listing content, controls and node IDs may change. The script fails
explicitly if the requested control or REA target is unavailable, and never
registers REA with a personal agent profile.
