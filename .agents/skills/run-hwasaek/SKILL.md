---
name: run-hwasaek
description: Run and verify HWASAEK web and Android, including bundled on-device makeup models, rewarded export and update gates.
---

Run commands from the repository root. In Windows PowerShell use `npm.cmd` because `npm.ps1` can be blocked by execution policy.

1. Check `vendor/vision/ready.json`. If absent, run the model preparation script in `package.json` on a network-enabled machine. It downloads the SDK, WASM, face model, segmentation model and license; no API key is needed. A successful download ends by writing the manifest.
2. Reuse an existing server at `http://127.0.0.1:4173/`, or start the package's start script. Restart an owned server after changing `server.js`; `.mjs` and `.wasm` MIME types matter for inference.
3. Run the unit checks and the relevant browser verification scripts in `package.json`. The browser scripts use local Chrome and debugging port 9226; run them sequentially. Inspect their launch paths when using another OS.
4. For actual model or rendering changes, use the real-model verification script. It exercises file selection, real face/skin/hair inference, makeup pixels, empty/multiple/small/tilted images, a second smiling portrait, inner-mouth exclusion and network requests. Read `screenshots/real-verification.json` and visually inspect the saved makeup images.
5. For UI state and recovery changes, use the UI verification script. Some recovery scenarios deliberately inject model results. Keep that evidence distinct from actual inference. Mobile viewport screenshots establish responsive layout, not physical iPhone/Safari behavior.

Completion requires successful relevant checks plus inspection of the resulting screen. Report which inputs and devices were actually exercised. Preserve the user's photo colors and the local-processing design; see `PROJECT_NOTES.txt` for accepted scope and pending work.

The default sample now uses the same real model and renderer as uploaded photos. Missing model assets are a startup dependency failure, not evidence that a face is absent. Browser test processes and temporary profiles belong to the verification run; stop and clean them after collecting evidence. Preserve a preview server that was already running for the user.

## Android verification

Use `android/README.md` for build and instrumentation commands. On this memory-limited PC, build and emulator tests sequentially; use a 1536 MB AVD and one Gradle worker. Confirm `sys.boot_completed=1`, working Wi-Fi and DNS before instrumentation. An emulator without a route looks like a production version-check failure. Resolve any System UI ANR before starting tests; avoid a second UIAutomator session while instrumentation is running.

The `liveAd=true` instrumentation scenario uses Google's official test rewarded unit and verifies a new MediaStore image after the SDK reward and dismissal callbacks. Keep that evidence distinct from the separate injected-callback test. Only instrumentation temporarily clears FLAG_SECURE for UI evidence; the protected screenshot must remain black. Inspect final screenshots and verify that phone-to-tablet resizing preserves makeup state. Reset `wm size`/`wm density` and stop the owned emulator after collecting evidence.
