# Receipt photo fixtures

The founder's own receipt photos, 26 of them, from Indonesia (Bali), Vietnam, Singapore and
Malaysia. Made-up receipt photos must not be added here.

## Redaction

Every photo was converted to JPEG, scaled to a long side of 1600 px and saved without any
metadata (no EXIF, GPS, maker notes, thumbnails, XMP or ICC profile). Black boxes cover what would
identify a person, a visit or a payment: dates and times, order, invoice, folio and ticket numbers,
cashier, waiter and guest names, room numbers, card and bank account details, flight details, QR
codes and e-invoice lookup codes. Merchant names, addresses and line items stay readable. A photo of
a receipt lying on a hotel invoice was left out: the receipt is also here on its own, and the invoice
under it is personal.

## Naming

`<language>-<what>.jpg`, for example `vi-grill-table.jpg`, `id-warung-long.jpg`,
`en-airport-cafe-card.jpg`. The part before the first `-` is the language hint passed to the
recogniser (`en` for the Singapore receipts, `ms` for Malaysia). The words after it name the shop
and what makes the photo hard (`finger`, `thumb`, `creased`, `folded`, `dark`, `small`,
`handwritten`), so the quality thresholds in `src/quality.ts` can be checked against photos that
should trip them and ones that should not.

## Tests and evals that read this folder

- iOS host tests, `OcrReaderTests.testFixtureReceipts` (`swift test --package-path apps/mobile/modules/cp-ocr/ios`):
  every photo reads as lines, or as `unsupported_script`, and has finite quality signals.
- Android: ML Kit runs only on a device with Google Play services, so the JVM unit tests
  (`./gradlew :cp-ocr:testDebugUnitTest`) cover the signal math on synthetic images instead, and
  `OcrScriptsTest` covers the `unsupported_script` answer for Thai hints, which Android gives
  before ML Kit runs.
- The receipt parse eval, `packages/ai/evals/receipt-parse/fixtures/`: the lines the recogniser reads
  from each photo, graded on the charges the paper prints (`EVAL_RECEIPT_PHOTOS=1 pnpm --filter
  @cp/ai eval receipt-parse`, and `evals/receipt-parse/line-accuracy.ts` per country).

Keep each photo under about 1 MB and the long side at 1600 px or less so the repo stays small.
