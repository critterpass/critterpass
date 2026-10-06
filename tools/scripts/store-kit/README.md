# Store kit

Everything a store listing needs, made from the app itself: listing copy, screenshots, icons and
preview videos. Copy and frame templates live in `packages/content/src/store`; output goes to
`apps/mobile/store/` (git-ignored).

| Step | Command | Result |
| --- | --- | --- |
| Listing copy | `pnpm tsx tools/scripts/store-kit/metadata.ts` | `apps/mobile/store.config.json` (EAS metadata) |
| Demo crew | `pnpm tsx tools/scripts/store-kit/seed-demo-crew.ts --api <staging api> [--code <crew code>]` | travellers, passes, a crew and its expenses, through `/v1/cmd` |
| Capture | `pnpm tsx tools/scripts/store-kit/capture.ts --platform android --dispatch --ref <branch> --build-url <e2e-test APK>` | a device run of `e2e/store-shots/<locale>/shots.yaml` |
| Collect | `pnpm tsx tools/scripts/store-kit/capture.ts --platform android --collect <downloaded artifacts>` | `apps/mobile/store/raw/<platform>/<locale>/<shot>.png` |
| Compose | `pnpm tsx tools/scripts/store-kit/compose.ts` | `apps/mobile/store/<store>/<size>/<locale>/<n>-<shot>.png` and `manifest.json` |
| Icons | `pnpm tsx tools/scripts/store-kit/icons.ts` | `app-store/icon-1024.png`, `play/icon-512.png` |
| Preview video | `pnpm tsx tools/scripts/store-kit/preview-video.ts --clips <clips.json> --store app-store` | `<store>/preview/preview-<locale>.mp4` and its poster frame |

## Rules the scripts enforce

- **Captures are the running app.** A screenshot comes from a device run against staging; the
  compositor only adds the frame, the caption and a critter sticker. A capture that is missing
  fails the run with the list of missing files.
- **Languages.** A language gets screenshots when it has a listing (`listing/<locale>.json`) and
  every shot template has its caption. Asking for any other language is an error.
- **Sizes.** `devices.json` lists the sizes per store; each is checked against the store's rules
  (App Store display sets; Google Play 9:16, 1080 to 3840 px). Output is RGB PNG with no alpha.
- **Captions** must fit three lines (two for the line under it) at one of the template's sizes;
  copy that does not fit fails instead of being cut off. Captions and listings never state a price.

## Demo crew seed

`seed-demo-crew.ts` writes only through the api's commands, the way the app does. It refuses to
run unless:

- the api base is local or a staging host (`staging` as its own word in the host name), and
- `GET /health` reports every supplier adapter as sandboxed:
  `{"suppliers": {"viator": "sandbox", …}}`. An api that does not report its adapters is refused.

Ids and op ids are derived from the seed name (`--seed`, default `store`), and the travellers'
sessions are kept in `.seed-state.json` (git-ignored, credentials), so a second run replays the
same commands and creates nothing new. With `--code` the travellers join the crew behind that code
(the capture device's crew) and add the crew's expenses to its confirmed trip in `--currency` (the
crew's settlement currency); without it the first traveller starts the crew and the code is
printed. `--dry-run` prints the plan without calling the api.

## Preview video

`clips.json` lists the recordings to cut, relative to the file:

```json
[{ "file": "vote.mp4", "start": 2, "duration": 6, "caption": { "en": "Vote on where to go" } }]
```

The cut must be 15 to 30 seconds. `--check <video>` reads any video with ffprobe and lists what
the store would refuse (size, codec, frame rate, length). Needs `ffmpeg` and `ffprobe` on the path
(`tools/scripts/install-ffmpeg.sh`).
