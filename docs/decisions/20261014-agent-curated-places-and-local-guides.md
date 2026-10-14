# Agent-curated places and local guides

Date: 2026-10-14
Status: Decided (founder, 14 Oct). Built with the curated places loader, the `local_guides` table,
`GET /v1/destinations/{id}/guides` and the local guides loader.

## Context

The most visited international destinations need places worth a crew's day and people who can
show them around, at a quality the open-data index alone does not give. Research agents read
official sites, travel guides, blogs and forums and write a short, sourced profile of each of a
destination's 25 or so most visited places, and find local guides and small guiding outfits that
travellers rate well.

## Decision

- **Claude agents curate places and their details** for the most visited international
  destinations. A curated profile is stored as reviewed content (`pois.editorial`, curation
  `editorial`), so it wins over any AI profile, and makes the place popular in its destination.
- **Open data stays the source of a place's address and point.** A curated line is matched to an
  Overture/OSM row by name and nearness; a line no row carries is reported and skipped, never
  created from the researcher's approximate point.
- **Facts keep how they are known.** A fee or opening hours read on a page keep that page and are
  `cited`; anything unconfirmed is an `estimate` and shown as one. The busy line is always an
  estimate.
- **Individual guides found on the web are listed**, each with a general review: a summary of
  their public reputation in our own words, in English and Vietnamese.
- **Guardrail: only what guides publish to sell guiding.** Name as published, profile page,
  languages, specialties, published price, a third-party platform's rating with its count and
  page, the licence flag, the review summaries and sources. Never a phone number, an email, a
  home address or private details; the loader refuses such lines and the table refuses an email.
  A rating read off the guide's own site is self-reported and stored as none.
- **Privacy class C0.** The data model's classes describe our users' data (C1 crew-visible, C2
  personal, C3 sensitive). A guide is not a user: the row holds public business information the
  guide published to sell their services, links no user, crew or trip, and is shown to every
  signed-in traveller, like a place. C2 would wrongly tie it to account export and deletion,
  which do not apply.
- **Hidden or removed on request.** A guide can be hidden (kept, shown to nobody) or removed
  (every field blanked but the profile page, which stays only so a later load never lists them
  again); a guide listed twice is merged into one.

## Consequences

- The app's "Local guides" section and the place page changes read these routes once the premium
  UI lands; the API is in place first.
- Re-running a loader updates in place; new cities arrive as files and load the same way.
