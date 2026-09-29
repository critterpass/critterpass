# Receipt photo fixtures

This folder receives the founder's real receipt photos. There are none yet, and made-up receipt
photos must not be added in their place.

## Naming

`<language>-<what>.jpg`, for example `vi-pho-flat.jpg`, `id-warung-crumpled.jpg`,
`ja-konbini-glare.jpg`, `th-7eleven-flat.jpg`. The part before the first `-` is the language hint
passed to the recogniser. The words after it name what the photo shows (`flat`, `crumpled`, `glare`,
`blurry`, `cut-off`), so each quality threshold in `src/quality.ts` can be checked against a photo
that should trip it and one that should not.

## Tests that read this folder

- iOS host tests, `OcrReaderTests.testFixtureReceipts` (`swift test --package-path apps/mobile/modules/cp-ocr/ios`):
  every photo reads as lines, or as `unsupported_script`, and has finite quality signals. The test
  is skipped while the folder has no photos.
- Android: ML Kit runs only on a device with Google Play services, so the JVM unit tests
  (`./gradlew :cp-ocr:testDebugUnitTest`) cover the signal math on synthetic images instead, and
  `OcrScriptsTest` covers the `unsupported_script` answer for Thai hints, which Android gives
  before ML Kit runs.

Keep each photo under about 1 MB (a long side of about 2000 px is enough) so the repo stays small.
