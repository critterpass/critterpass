# Affiliate disclosure and "contains ads"

Decision (docs/product-decisions.md D10): CritterPass is never the merchant of record; stays and
some activities are booked through partner links that may pay a commission; ranking is
commission-neutral. Facts below were read from the repository on 2026-10-07.

| Where | What the user sees | Evidence |
|---|---|---|
| Supplier cards in bookings | "We may earn a commission. It never changes what {guide} recommends." (`suppliers.disclosure.affiliate`) | `apps/mobile/src/features/bookings/supplier/copy.ts`, `apps/mobile/src/features/bookings/supplier/Disclosure.tsx`, `apps/mobile/src/ui/trip/SupplierCard.tsx` |
| Explore supplier cards and sponsored picks | a "why sponsored" sheet | `apps/mobile/src/features/explore/components/supplier-card.tsx`, `apps/mobile/src/features/explore/components/why-sponsored-sheet.tsx` |
| Legal | "Affiliate links" document | `packages/content/src/legal/affiliates/1.0.0.mdx` (draft, not counsel-approved) |
| Outbound links | partner links leave through `/out/` on the web host | `apps/web/src/pages/out` |

## Store declarations (proposed; the founder enters them)

| Question | Proposed answer | Basis |
|---|---|---|
| Google Play "Contains ads" | No | no advertising SDK in `apps/mobile/package.json`; no `AD_ID` permission, AdSupport or tracking prompt in `apps/mobile/app.config.ts` or its plugins. Sponsored partner cards are labelled in place. Whether Play counts labelled sponsored placements as ads is a policy reading the founder confirms (unknown) |
| App Store "third-party advertising" in privacy labels | No | same |
| Affiliate relationship disclosed | Yes | rows above |

## Open

- Every surface that shows a partner link has not been walked on a device against this table; the
  list above comes from a source search for the disclosure copy, so a surface that links out
  without it would not appear here (unknown).
- Partner programme terms (Agoda, Trip.com, Travelpayouts, Viator, Klook) each have their own
  disclosure wording rules; checking our copy against them is a founder item.
