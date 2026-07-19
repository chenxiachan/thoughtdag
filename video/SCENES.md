# Hero video — scene contract (30 fps, 1920×1080)

Each scene file `src/scenes/SceneN.tsx` MUST export:
- `SCENEN_DURATION` — duration in frames (30fps; ~5.5s scenes = 165, 4.5s = 135, end card = 90)
- `SceneN` — React component

Conventions:
- Real UI footage goes in `video/public/sceneN.mp4` (H.264). Embed with
  `<OffthreadVideo src={staticFile('sceneN.mp4')} />` from 'remotion'.
- Footage viewport: record at 1600×900 or larger; in the scene, scale/crop so
  the SUBJECT fills the frame (user feedback: elements too small — go big).
- Use `Caption` and `Stage` from '../Caption' for the caption bar and backdrop.
- Fade the scene in/out over ~10 frames (interpolate on opacity) so cuts feel
  soft when Series concatenates.
- No invented UI: footage is the real app at http://localhost:5173 (dev server
  running). Drive it with Playwright (`recordVideo` on the browser context,
  size 1600×900), convert webm → mp4 with ffmpeg (`-c:v libx264 -pix_fmt
  yuv420p -crf 18`). Recording scripts live in `.local-e2e/record-hero-*.mjs`.
- Seed canvas content via `window.__store.setState` / `window.__rf.setViewport`
  (DEV globals). Mock `/api/**` with realistic streaming bodies so answers
  stream visibly (multiple `data: {"text":"…"}` chunks fulfilled with delay
  need route.fulfill once — instead simulate by streaming into the store or
  accept single-shot answers).
- Trim footage in Remotion via `startFrom`/`endAt` props on OffthreadVideo.
