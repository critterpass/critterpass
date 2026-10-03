/**
 * Stock photos a reviewer looked at and turned down as generic place photos, by candidate id: a
 * visible brand or shop sign would pass for (or advertise) a business that is not the place, and
 * an off-subject picture says nothing about what the place serves. The batch skips them and
 * offers the next result for the same subject.
 */
export const REJECTED_GENERIC: Readonly<Record<string, 'brand' | 'off-subject'>> = {
  'pexels-photo-36238400': 'brand', // a Starbucks napkin under the bagel
  'pixabay-photo-209148': 'brand', // beer tap badges
  'pexels-photo-35925508': 'brand', // spirit labels fill the frame
  'pixabay-photo-8346641': 'brand', // spirit labels
  'pexels-photo-30271790': 'brand', // spirit labels fill the frame
  'pexels-photo-37552204': 'brand', // a bánh mì shop's printed bag
  'pexels-photo-31722934': 'brand', // a café's cup
  'pixabay-photo-4271392': 'brand', // a liqueur's bar mat
  'pexels-photo-684968': 'brand', // a gelateria's cup
  'pexels-photo-14356408': 'brand', // a brewery's glass
  'pixabay-photo-1998293': 'brand', // a brewery's bottle
  'pexels-photo-1267681': 'brand', // a brewery's glasses
  'pexels-photo-15491134': 'brand', // a stall's sign
  'pexels-photo-32961655': 'brand', // newspaper mastheads
  'pexels-photo-35409563': 'brand', // a bánh mì shop's wrapper
  'pexels-photo-2591594': 'brand', // a restaurant's menu
  'pexels-photo-34332795': 'brand', // stall signs
  'pexels-photo-33022448': 'brand', // a shop front and its sign
  'pexels-photo-31596394': 'brand', // a restaurant's placemat
  'pixabay-photo-2772941': 'off-subject', // a German town square, not a rooftop bar
  'pixabay-photo-9246365': 'off-subject', // a river landscape, not cao lầu
  'pixabay-photo-968657': 'off-subject', // olive oil, not a vegan bowl
  'pixabay-photo-2060886': 'off-subject', // dry pasta, not mì Quảng
  'pixabay-photo-1631863': 'off-subject', // dry pasta, not mì Quảng
  'pexels-photo-8551435': 'brand', // a brand's bar mat
  'pexels-photo-5061036': 'brand', // a gelateria's cup
  'pexels-photo-1267289': 'brand', // a brewery's glasses
  'pixabay-photo-2468985': 'brand', // a brewery's bottle
  'pixabay-photo-5575481': 'brand', // instant noodle packets, not bánh canh
  'pixabay-photo-1331447': 'off-subject', // an open ham sandwich, not bánh mì
  'pixabay-photo-9255590': 'off-subject', // boats at night, not bún bò
  'pixabay-photo-8447394': 'off-subject', // bread rolls, not bún thịt nướng
  'pixabay-photo-6762303': 'off-subject', // a country road, not mì Quảng
  'pixabay-photo-4226899': 'brand', // a cigar band
  'pexels-photo-37172281': 'brand', // a stall's signs and prices
  'pexels-photo-32961649': 'brand', // newspaper mastheads
  'pexels-photo-14357937': 'brand', // a shop's sign
  'pixabay-photo-1503117': 'off-subject', // a European soup, not bánh canh
  'pixabay-photo-6760884': 'off-subject', // bánh khọt, not bánh mì
  'pixabay-photo-5351180': 'off-subject', // leaves, not bún bò
  'pexels-photo-32961654': 'brand', // newspaper mastheads
  'pixabay-photo-6696940': 'off-subject', // the Huế citadel, a named landmark, not bún bò
  'pixabay-photo-2148092': 'off-subject', // bánh tét boiling, not bánh mì
  'pexels-photo-31412386': 'brand', // a shop's printed card beside the bowl
  'pexels-photo-36156594': 'brand', // a sandwich shop's printed paper
  'pixabay-photo-3286574': 'off-subject', // a Korean hot pot, not bún bò
};
