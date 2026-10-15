/** A trip with days saved on this phone, as Settings > Offline lists it. */
export interface SavedTrip {
  readonly tripId: string;
  readonly name: string;
  readonly kinds: readonly string[];
  readonly bytes: number;
  /**
   * The areas whose map the saved days hold, the trip's city first ("Cusco", "Machu Picchu");
   * empty for a trip that holds its own city's map alone, whose row reads as it always has.
   */
  readonly mapAreas?: readonly string[] | undefined;
}
