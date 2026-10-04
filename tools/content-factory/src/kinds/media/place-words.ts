/**
 * The words place names are made of, in the languages the destinations use (Vietnamese, English,
 * Spanish, Portuguese, Indonesian, Icelandic and Japanese): the place types, and the words that
 * name a region or say nothing about which place it is. A type word never sets a place apart, and
 * a place named with one only matches an item named with the same type (see place-match.ts).
 */

/** Place types, each in the words names use for it (lower case, marks dropped). */
export const TYPES: Readonly<Record<string, readonly string[]>> = {
  religious: [
    ...['chua', 'pagoda', 'temple', 'den', 'shrine', 'mieu', 'thien vien'],
    ...['pura', 'candi', 'vihara', 'jinja', 'taisha', 'jingu', 'ji', 'dera', 'tera'],
    ...['mosque', 'mezquita', 'mesquita', 'masjid', 'synagogue', 'sinagoga'],
  ],
  church: [
    ...['nha tho', 'cathedral', 'church', 'chapel', 'basilica'],
    ...['iglesia', 'templo', 'catedral', 'capilla', 'parroquia'],
    ...['igreja', 'capela', 'paroquia', 'ermida', 'se'],
    ...['gereja', 'katedral', 'paroki', 'kirkja', 'domkirkja'],
  ],
  convent: [
    ...['convent', 'monastery', 'abbey'],
    ...['convento', 'exconvento', 'monasterio', 'mosteiro'],
  ],
  museum: [
    ...['bao tang', 'museum', 'gallery', 'museo', 'museu', 'galeria', 'galleri', 'safn'],
    ...['bijutsukan', 'hakubutsukan'],
  ],
  bridge: ['cau', 'bridge', 'puente', 'ponte', 'jembatan', 'bashi', 'hashi', 'bru'],
  beach: ['bai bien', 'beach', 'bai tam', 'bay', 'vinh', 'playa', 'praia', 'pantai', 'baia'],
  mountain: [
    ...['nui', 'mountain', 'mountains', 'peak', 'hill', 'hills', 'mount', 'mt'],
    ...['gunung', 'monte', 'cerro', 'nevado', 'volcan', 'volcano', 'vulkan', 'yama', 'fjall'],
  ],
  pass: ['deo', 'pass'],
  cave: ['cave', 'caves', 'grotto', 'goa', 'gua', 'cueva', 'cuevas', 'gruta', 'hellir'],
  market: ['cho', 'market', 'mercado', 'pasar', 'feira', 'ichiba'],
  park: ['cong vien', 'park', 'parque', 'taman', 'koen', 'bosque', 'forest', 'reserve'],
  garden: [
    ...['garden', 'gardens', 'jardin', 'jardines', 'jardim', 'jardins', 'kebun', 'teien'],
    ...['botanical', 'botanic', 'botanico'],
  ],
  river: ['song', 'river', 'rio', 'sungai', 'gawa', 'kawa'],
  lake: ['lake', 'lago', 'laguna', 'lagoa', 'lagoon', 'danau', 'vatn'],
  waterfall: [
    ...['waterfall', 'waterfalls', 'falls', 'foss', 'air terjun'],
    ...['catarata', 'cataratas', 'cascada', 'cascata'],
  ],
  landform: ['glacier', 'jokull', 'crater', 'geyser', 'canyon', 'valley', 'valle', 'vale'],
  restaurant: [
    ...['nha hang', 'restaurant', 'quan an', 'ca phe', 'restaurante', 'restoran', 'warung'],
    ...['cafe', 'cafeteria', 'coffee', 'kaffi', 'kaffihus', 'bistro', 'bar', 'pub', 'cantina'],
    ...['taqueria', 'pizzeria', 'bakery', 'panaderia', 'pastelaria', 'padaria', 'izakaya'],
    ...['brewery', 'taproom', 'cerveceria', 'cervejaria', 'club', 'lounge', 'kitchen', 'grill'],
  ],
  hospital: [
    ...['benh vien', 'hospital', 'clinic', 'clinica', 'klinik', 'rumah sakit'],
    ...['pharmacy', 'farmacia', 'apotek', 'spa'],
  ],
  station: [
    ...['ga', 'station', 'sta', 'san bay', 'airport', 'terminal', 'metro', 'metrobus'],
    ...['estacion', 'estacao', 'aeropuerto', 'aeroporto', 'stasiun', 'bandara', 'eki'],
    ...['harbour', 'harbor', 'port', 'puerto', 'pelabuhan', 'dermaga', 'ferry', 'bus', 'stop'],
  ],
  hotel: [
    ...['khach san', 'hotel', 'resort', 'hostel', 'hostal', 'villa', 'villas', 'ryokan', 'inn'],
    ...['lodge', 'guesthouse', 'homestay', 'posada', 'pousada'],
  ],
  palace: ['palace', 'palacio', 'istana', 'puri', 'gosho'],
  castle: ['castle', 'castillo', 'castelo', 'jo', 'fortress', 'fortaleza', 'fort', 'benteng'],
  tower: ['tower', 'torre', 'menara', 'turn'],
  square: ['square', 'plaza', 'plazuela', 'plazoleta', 'praca', 'largo', 'zocalo', 'torg'],
  viewpoint: ['viewpoint', 'lookout', 'view', 'mirador', 'miradouro'],
  street: [
    ...['street', 'road', 'avenue', 'calle', 'callejon', 'avenida', 'paseo', 'calzada'],
    ...['rua', 'travessa', 'jalan', 'dori', 'vegur', 'barrio', 'bairro', 'district', 'colonia'],
  ],
  monument: [
    ...['statue', 'monument', 'memorial', 'fountain', 'arch', 'gate'],
    ...['estatua', 'monumento', 'monumen', 'patung', 'fuente', 'fonte', 'arco', 'puerta'],
  ],
  stage: ['theatre', 'theater', 'teatro', 'cinema', 'cine', 'stadium', 'estadio', 'arena'],
  school: [
    ...['library', 'biblioteca', 'university', 'universidad', 'universidade'],
    ...['school', 'colegio', 'academia'],
  ],
  trail: ['trail', 'trek', 'footpath', 'tour', 'tours', 'sendero'],
  shop: ['shop', 'store', 'tienda', 'loja', 'toko', 'boutique', 'factory'],
  site: ['archaeological', 'arqueologico', 'arqueologica', 'ruins', 'ruinas'],
  cemetery: ['cemetery', 'cementerio', 'cemiterio', 'panteon'],
  zoo: ['zoo', 'zoologico', 'aquarium', 'acuario', 'aquario'],
};

/**
 * Types a single word carries in its ending: Icelandic compounds its names (Gullfoss is a
 * waterfall, Hallgrímskirkja a church) and Japanese writes them without spaces (高台寺 is a
 * temple). The word is longer than the ending.
 */
export const TYPE_ENDINGS: readonly (readonly [string, string])[] = [
  ['foss', 'waterfall'],
  ['fossar', 'waterfall'],
  ['jokull', 'landform'],
  ['kirkja', 'church'],
  ['fjall', 'mountain'],
  ['vatn', 'lake'],
  ['safn', 'museum'],
  ['寺', 'religious'],
  ['院', 'religious'],
  ['神社', 'religious'],
  ['大社', 'religious'],
  ['神宮', 'religious'],
  ['天満宮', 'religious'],
  ['駅', 'station'],
  ['城', 'castle'],
  ['公園', 'park'],
  ['庭園', 'garden'],
  ['美術館', 'museum'],
  ['博物館', 'museum'],
  ['橋', 'bridge'],
  ['山', 'mountain'],
];

/** Venues that take the name of what they show or stand by: the Machu Picchu museum in Cusco. */
export const VENUES: ReadonlySet<string> = new Set([
  ...['museum', 'market', 'restaurant', 'hospital', 'station', 'hotel', 'shop', 'school'],
  ...['stage', 'street', 'trail', 'zoo', 'cemetery'],
]);

/** Natural features and crossings a temple is often named after. */
export const FEATURES: ReadonlySet<string> = new Set([
  ...['beach', 'mountain', 'pass', 'cave', 'river', 'lake', 'waterfall', 'landform', 'bridge'],
]);

export const WORSHIP: ReadonlySet<string> = new Set(['religious', 'church', 'convent']);

/** Words that name the region, or say nothing about which place it is. */
export const PLAIN: ReadonlySet<string> = new Set([
  ...['da', 'nang', 'danang', 'hoi', 'an', 'hoian', 'lat', 'quang', 'nam', 'viet', 'vietnam'],
  // "Khu du lịch": tourist area.
  ...['khu', 'lich', 'kdl'],
  ...['of', 'the', 'and', 'va', 'de', 'old', 'ancient', 'town', 'city'],
  ...['thanh', 'pho', 'co', 'dinh', 'lang'],
  ...['in', 'at', 'del', 'la', 'el', 'los', 'las', 'do', 'dos', 'das', 'di', 'du', 'le', 'y'],
  ...['e', 'o', 'a', 'i', 'og', 'no', 'en'],
  ...['centro', 'historico', 'historic', 'center', 'centre', 'downtown'],
  ...['san', 'santa', 'santo', 'sao', 'saint', 'st', 'nossa', 'senhora', 'nuestra', 'senora'],
  ...['kyoto', 'kioto', '京都', 'japan', 'bali', 'indonesia', 'cusco', 'cuzco', 'peru'],
  ...['mexico', 'cdmx', 'df', 'ciudad', 'lisboa', 'lisbon', 'portugal'],
  ...['iceland', 'island', 'islands', 'islandia', 'reykjavik', 'isla', 'ilha', 'pulau', 'nusa'],
]);
