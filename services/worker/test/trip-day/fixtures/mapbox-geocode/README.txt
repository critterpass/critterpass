Recorded 3 Oct 2026 01:05 ICT from Mapbox Geocoding v6 forward (permanent=true, proximity=108.22,16.05); no token is kept in any file.
- v6-forward-address-vo-nguyen-giap-da-nang.json: q="10 Võ Nguyên Giáp, Đà Nẵng", types=address -> no features (Mapbox has no house-number addresses there).
- v6-forward-street-only-vo-nguyen-giap-da-nang.json: q="10 Vo Nguyen Giap, Da Nang, Vietnam" (no types) -> four 'street' features, no match_code confidence.
- v6-forward-locality-only-bach-dang-da-nang.json: q="35 Bạch Đằng, Hải Châu, Đà Nẵng" (no types) -> one 'locality' feature (Hải Châu).
- v6-forward-hotel-lobby-da-nang.json: q="hotel lobby" (no types) -> a 'street' named Lobby in Hòa Hiệp Nam, no confidence.
- v6-forward-address-constructed-lisbon.json: constructed, not recorded. Built from the documented v6 response shape (an 'address' feature with match_code confidence 'exact') for the accept case, because no recorded query in our destinations returned a house-number address.
