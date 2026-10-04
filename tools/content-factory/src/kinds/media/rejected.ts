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
  'pexels-photo-37106679': 'off-subject', // satay skewers, not babi guling
  'pexels-photo-8629084': 'off-subject', // raw salmon on a board, not bacalhau
  'pexels-photo-8351639': 'off-subject', // market fish, not bacalhau
  'pexels-photo-6426146': 'off-subject', // a leaf-wrapped cake, not bánh bèo
  'pexels-photo-36459924': 'brand', // spirit labels
  'pexels-photo-29548583': 'brand', // a brand's bar mat
  'pixabay-photo-4614215': 'brand', // a stout's tap badge
  'pixabay-photo-1064663': 'off-subject', // a portrait at a bar
  'pexels-photo-8794060': 'off-subject', // brown strips on white, not chocolate
  'pexels-photo-5865683': 'off-subject', // a street through a window, a hotel's sign
  'pexels-photo-1383787': 'off-subject', // a waffle counter, not gelato
  'pexels-photo-15271732': 'off-subject', // a shop with a statue, not a hot dog
  'pexels-photo-31930768': 'brand', // sake barrels with their brewers' names
  'pexels-photo-22891891': 'brand', // mezcal labels
  'pexels-photo-28490834': 'brand', // soda and beer bottles
  'pixabay-photo-7479798': 'off-subject', // a lemon in a glass, not a pisco sour
  'pexels-photo-34418036': 'off-subject', // a portrait of a bartender
  'pexels-photo-14471525': 'off-subject', // a dark building, not a rooftop bar
  'pexels-photo-7767659': 'off-subject', // studio props, not sushi
  'pexels-photo-6310256': 'off-subject', // a waiter with a plate, not tacos
  'pixabay-photo-7249273': 'off-subject', // a chicken noodle bowl, not betutu
  'pixabay-photo-4483833': 'off-subject', // roast pork with bread dumplings, not babi guling
  'pixabay-photo-2315552': 'off-subject', // an empty mug, not a café
  'pixabay-photo-2315562': 'off-subject', // an empty mug, not a café
  'pixabay-photo-2315554': 'off-subject', // a mug on a garden table, no coffee in sight
  'pixabay-photo-2315555': 'off-subject', // an empty mug, not a café
  'pixabay-photo-2318315': 'off-subject', // a mug on a garden table, no coffee in sight
  'pixabay-photo-4022016': 'off-subject', // a plate of snacks, not coffee
  'pixabay-photo-8113165': 'off-subject', // sushi rolls, not a grilled seafood platter
  'pixabay-photo-5262458': 'off-subject', // a blurred leaf and tomato, no dish
  'pixabay-photo-1618638': 'brand', // sake bottles with their labels
  'pixabay-photo-6990535': 'brand', // a tea shop's printed cup
  'pixabay-photo-5567269': 'off-subject', // layered coffee by a pond, not mezcal
  'pixabay-photo-7890204': 'off-subject', // rice terraces, not a plate of nasi campur
  'pixabay-photo-3898440': 'off-subject', // ballet dancers' legs, not a nightclub
  'pixabay-photo-2561506': 'off-subject', // a portrait of a DJ
  'pixabay-photo-4779953': 'off-subject', // a panelled hall, not a nightclub
  'pixabay-photo-7286902': 'off-subject', // a bowl of peppers by a lake, not a Peruvian dish
  'pixabay-photo-1077117': 'off-subject', // a cream dessert, not a Peruvian dish
  'pixabay-photo-2587577': 'off-subject', // a portrait of a diner
  'pixabay-photo-8257030': 'off-subject', // a glass on a magazine, not a restaurant table
  'pixabay-photo-9826328': 'off-subject', // an alley bar and its signs, not a rooftop
  'pixabay-photo-4806610': 'brand', // shop signs at night
  'pixabay-photo-1525755': 'off-subject', // a child in the surf
  'pixabay-photo-5388580': 'off-subject', // shredded meat, not tacos
  'pixabay-photo-109345': 'off-subject', // a pool table, not tacos
  'pixabay-photo-2060499': 'brand', // a whisky bottle and its label
  'pexels-photo-29841944': 'off-subject', // a yard with a spit and its cooks, not a plate of babi guling
  'pixabay-photo-7219969': 'off-subject', // curry pots from above, not betutu
  'pexels-photo-34523696': 'off-subject', // a bánh mì cart at night, not bánh xèo
  'pexels-photo-2563203': 'off-subject', // a street cook and her stoves, not bánh xèo
  'pixabay-photo-7006591': 'off-subject', // canapés, not a seafood platter
  'pixabay-photo-5412527': 'brand', // sake bottles with their labels
  'pexels-photo-23985881': 'brand', // sake bottles with their labels
  'pixabay-photo-7953714': 'off-subject', // eel on rice, not yakiniku
  'pixabay-photo-1868386': 'off-subject', // a glass tower, not mezcal
  'pixabay-photo-527286': 'off-subject', // pasta on forks, not mì Quảng
  'pixabay-photo-658569': 'off-subject', // a walnut, not a nightclub
  'pixabay-photo-1522080': 'off-subject', // a dessert, not a Peruvian dish
  'pixabay-photo-4499023': 'off-subject', // a rocky shore, not a pisco sour
  'pexels-photo-11309986': 'off-subject', // a wall of shelves and a music stand, not a pub
  'pixabay-photo-1951386': 'off-subject', // a plate that says "love"
  'pixabay-photo-5475283': 'brand', // shop signs in a street
  'pixabay-photo-5580792': 'off-subject', // cheese and dips, not tacos
  'pixabay-photo-6906620': 'off-subject', // a bowl of chilli sauce, not tapas
  'pixabay-photo-5250765': 'off-subject', // beef phở, not chicken rice
  'pixabay-photo-7597586': 'off-subject', // lettuce rolls, not bún mắm
  'pexels-photo-11434408': 'off-subject', // a salad, not bún mắm
  'pixabay-photo-5118010': 'off-subject', // a library, not a dish
  'pixabay-photo-1252651': 'off-subject', // dumplings in sauce, not seafood
  'pexels-photo-8351647': 'off-subject', // market fish, not a dish
  'pixabay-photo-2315564': 'off-subject', // an empty mug, not a café
  'pexels-photo-27573831': 'brand', // sake barrels with their brewers' names
  'pixabay-photo-7953712': 'off-subject', // eel on rice, not yakiniku
  'pexels-photo-22891865': 'brand', // mezcal bottles and their labels
  'pixabay-photo-4252014': 'off-subject', // rice terraces, not rice paper rolls
  'pexels-photo-34202549': 'off-subject', // fish sauce jars from the air, not a bowl of bún mắm
  'pixabay-photo-1040653': 'off-subject', // a teacup, not sake
};
