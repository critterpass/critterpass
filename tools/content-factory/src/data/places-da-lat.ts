/**
 * Đà Lạt's curated set, by hand: the places it always holds (the sights the landmark step does
 * not reach, the town's cafés and food, each with what it is where the note writer needs it) and
 * the duplicate pairs settled by a street address or a Wikidata item. See ./pinned-places for
 * what each list means; ./places-da-lat-left-out holds the records the set never takes.
 */
import type { PairRuling } from '../kinds/places/merges';
import type { PinnedPlace } from '../kinds/places/pins';

export const DA_LAT_PINS: readonly PinnedPlace[] = [
  // Essentials the lists above did not pin.
  { name: 'Langbiang', nameLocal: 'Đỉnh Langbiang', lat: 12.0472, lng: 108.44, essential: true },
  {
    name: 'Linh Phước Pagoda',
    nameLocal: 'Chùa Linh Phước',
    lat: 11.9444,
    lng: 108.4994,
    essential: true,
  },
  {
    name: 'Valley of Love',
    nameLocal: 'Thung lũng Tình Yêu',
    lat: 11.9801,
    lng: 108.4502,
    essential: true,
  },
  {
    name: 'Đà Lạt Flower Garden',
    nameLocal: 'Vườn hoa thành phố Đà Lạt',
    lat: 11.9504,
    lng: 108.4497,
    essential: true,
  },
  {
    name: 'Xuân Hương Lake',
    nameLocal: 'Hồ Xuân Hương',
    lat: 11.9433,
    lng: 108.4479,
    essential: true,
  },
  {
    name: 'Đà Lạt Railway Station',
    nameLocal: 'Ga Đà Lạt',
    lat: 11.9416,
    lng: 108.4546,
    category: 'museum',
    essential: true,
  },
  { name: 'Datanla Falls', nameLocal: 'Thác Datanla', lat: 11.9011, lng: 108.449, essential: true },
  {
    name: 'Trúc Lâm Zen Monastery',
    nameLocal: 'Thiền viện Trúc Lâm Đà Lạt',
    lat: 11.9034,
    lng: 108.4359,
    essential: true,
  },
  {
    name: 'Bảo Đại Summer Palace (Dinh III)',
    nameLocal: 'Dinh Bảo Đại III',
    lat: 11.9302,
    lng: 108.4293,
    essential: true,
  },
  {
    name: 'Đà Lạt Cathedral',
    nameLocal: 'Nhà thờ Con Gà',
    lat: 11.9365,
    lng: 108.4377,
    essential: true,
  },
  // Sights the landmark list misses or matches to a record at the wrong point.
  {
    name: 'Crazy House',
    essential: true,
    nameLocal: 'Biệt thự Hằng Nga',
    lat: 11.9347,
    lng: 108.4308,
    category: 'museum',
  },
  { name: 'Đà Lạt Market', essential: true, lat: 11.9426, lng: 108.437 },
  {
    name: 'Đà Lạt Night Market',
    essential: true,
    nameLocal: 'Chợ đêm Đà Lạt',
    lat: 11.9423,
    lng: 108.437,
  },
  { name: 'Lam Dong Museum', lat: 11.9408, lng: 108.4598 },
  {
    name: 'Da Lat Pedagogy College',
    // The Vietnamese label of Wikidata item Q10828808; the FSQ record of the college spells it so.
    nameLocal: 'Trường Cao đẳng Sư phạm Đà Lạt',
    lat: 11.9463,
    lng: 108.4525,
    kind: 'a college in a French-era school building, the former Lycée Yersin',
    // A working college, not among the sights a short first visit leads with: in the set, not flagged.
    mustSee: false,
  },
  {
    name: 'Lâm Viên Square',
    essential: true,
    nameLocal: 'Quảng Trường Lâm Viên',
    category: 'museum',
    lat: 11.939,
    lng: 108.445,
    kind: "the town's central square",
  },
  { name: 'Đa Phú Hill', lat: 11.9813, lng: 108.4055, kind: 'a hill', category: 'nature' },
  { name: 'Fresh Garden', lat: 11.946, lng: 108.4082, kind: 'a flower garden park' },
  // Landmarks whose notes need to know what they are.
  {
    name: 'Golden Valley',
    lat: 12.0064,
    lng: 108.3822,
    kind: 'a landscaped valley park in pine forest by the Suối Vàng stream',
  },
  {
    name: 'Trại Mát Station',
    lat: 11.946,
    lng: 108.501,
    kind: 'the station where the tourist train from Ga Đà Lạt ends',
  },
  // Filed under a wrong category in the open data.
  {
    name: 'Cam Ly Waterfall',
    lat: 11.9419,
    lng: 108.4206,
    kind: 'a waterfall',
    category: 'nature',
    // The stream carries the city's waste water and is commonly described as polluted: in the
    // set, not flagged.
    mustSee: false,
  },
  {
    name: 'Nem Nướng Bà Hùng',
    lat: 11.9516,
    lng: 108.4333,
    kind: 'a nem nướng (grilled pork roll) restaurant',
    category: 'food',
  },
  // Cafés: the town is known for them.
  { name: 'An Cafe', lat: 11.9417, lng: 108.4337, kind: 'a café' },
  { name: 'Là Việt Coffee', lat: 11.9568, lng: 108.4351, kind: "a coffee roaster's café" },
  { name: "K'Ho Coffee", lat: 12.0097, lng: 108.4129, kind: "a coffee farm's café" },
  { name: 'Bùi Văn Ngọ Coffee', lat: 11.9248, lng: 108.4469, kind: 'a café' },
  { name: 'Horizon Coffee', lat: 11.9235, lng: 108.4483, kind: 'a café' },
  { name: 'Lưng Chừng', lat: 11.9209, lng: 108.4472, kind: 'a café' },
  { name: 'Dalat Nights Café', lat: 11.926, lng: 108.4453, kind: 'a café' },
  { name: 'Lululola', lat: 11.9201, lng: 108.442, kind: 'a music café' },
  { name: 'Mây Lang Thang', lat: 11.9414, lng: 108.4658, kind: 'a music café', category: 'food' },
  { name: 'Still Cafe', lat: 11.9443, lng: 108.4544, kind: 'a café' },
  { name: 'Tiệm Cà Phê Túi Mơ To', lat: 11.9411, lng: 108.4836, kind: 'a café' },
  { name: 'Tiệm Cà Phê Cheo Veooo', lat: 11.9381, lng: 108.4822, kind: 'a café' },
  { name: 'Kong cafe Dalat', lat: 11.9364, lng: 108.4834, kind: 'a café' },
  { name: 'Panorama Dalat Cafe', lat: 11.9467, lng: 108.4901, kind: 'a café' },
  { name: 'Da Lat Mountain View', lat: 11.9387, lng: 108.4633, kind: 'a café' },
  { name: 'In The Forest Đà Lạt', lat: 11.9283, lng: 108.4548, kind: 'a café' },
  { name: 'Tiệm cà phê Nhà Bên Suối', lat: 11.9023, lng: 108.4444, kind: 'a café' },
  { name: 'The Married Beans', lat: 11.9423, lng: 108.4228, kind: 'a café' },
  { name: 'Bicycle Up', lat: 11.9449, lng: 108.4348, kind: 'a café' },
  { name: 'one more cafe', lat: 11.9441, lng: 108.4331, kind: 'a café' },
  // Local food and sweets.
  { name: 'Liên Hoa Bakery', lat: 11.943, lng: 108.435, kind: 'a bakery' },
  { name: 'Quán Hoa Sữa', lat: 11.9436, lng: 108.4354, kind: 'a soy-milk stall' },
  { name: 'Chè Hé', lat: 11.9428, lng: 108.4352, kind: 'a chè (sweet soup) shop' },
  {
    name: 'Bánh tráng nướng Dì Đinh',
    lat: 11.9428,
    lng: 108.4286,
    kind: 'a grilled rice paper (bánh tráng nướng) stall',
  },
  {
    name: 'Lẩu Bò Ba Toa Quán Gỗ',
    lat: 11.9414,
    lng: 108.4295,
    kind: 'a beef hotpot restaurant',
  },
  { name: 'Góc Hà Thành', lat: 11.944, lng: 108.4347, kind: 'a Vietnamese restaurant' },
  { name: 'artist alley restaurant', lat: 11.9465, lng: 108.4353, kind: 'a restaurant' },
  {
    name: 'Le Chalet Dalat Cafe & Bistro',
    lat: 11.9349,
    lng: 108.4309,
    kind: 'a café and bistro',
  },
  { name: 'Le Rabelais', lat: 11.9377, lng: 108.4405, kind: 'a French restaurant' },
];

export const DA_LAT_RULINGS: readonly PairRuling[] = [
  {
    refs: [
      'overture:5415d2a0-d421-4309-ad0d-fb45cb575cf8',
      'overture:63c84dd5-a85b-41fc-af31-948666e41117',
    ],
    names: ['Hồ Tuyền Lâm', 'Hồ Tuyền Lâm Đà Lạt'],
    same: true,
    why: 'both name the lake of Wikidata item Q10772031',
  },
  {
    refs: [
      'overture:3982f2b2-efbf-42bd-b083-29ca3525ac15',
      'overture:6cbe82e1-2453-447a-b104-710bba1ff7be',
    ],
    names: ['Khu du lịch Thác Prenn', 'Prenn Waterfall'],
    same: true,
    why: 'both name the falls of Wikidata item Q10825669',
  },
  {
    refs: [
      'overture:bd1d36af-1948-48dd-8334-c210877e0cdd',
      'overture:72b9b75c-be79-45c4-b4e3-0e118a5a66f5',
    ],
    names: ['Thung lũng Vàng Đà Lạt', 'Thung Lũng Vàng, Đà Lạt'],
    same: true,
    why: 'both name the valley of Wikidata item Q16481443',
  },
  {
    refs: [
      'overture:6dced2dc-36f0-4b32-af41-5079c6518ac8',
      'overture:ac93aa75-e869-417b-a4f0-828b5fc9eb86',
    ],
    names: ['Banh Mi Xiu Mai (hẻm 279 Phan Đình Phùng)', 'Banh Mi Xiu Mai (26 Hoàng Diệu)'],
    same: false,
    why: 'two street addresses',
  },
  {
    refs: [
      'overture:6dced2dc-36f0-4b32-af41-5079c6518ac8',
      'overture:87f2c9fa-06f8-4ef3-8799-0bbeae52fd2b',
    ],
    names: ['Banh Mi Xiu Mai (hẻm 279 Phan Đình Phùng)', 'Bánh mì xíu mại 79 (179 Ba Tháng Hai)'],
    same: false,
    why: 'two street addresses',
  },
  {
    refs: [
      'overture:87f2c9fa-06f8-4ef3-8799-0bbeae52fd2b',
      'overture:d92c443f-51f8-4e10-86ef-500b2433ae5f',
    ],
    names: ['Bánh mì xíu mại 79 (179 Ba Tháng Hai)', 'Bánh mì xíu mại Chén (342b Lê Quý Đôn)'],
    same: false,
    why: 'two street addresses',
  },
  {
    refs: ['fsq_os:6287518fa3bf540a71a04c36', 'overture:01d8de4a-82ea-4ad8-bcd1-bdf4f5b792e3'],
    names: ['Bánh Ướt Lòng Gà Trang (15F Tăng Bạt Hổ)', 'Bánh Ướt Lòng Gà 70 (70 Phan Đình Phùng)'],
    same: false,
    why: 'two street addresses',
  },
  {
    refs: [
      'overture:3880329d-d5c5-4074-a6a3-d913f49fbfd7',
      'overture:b0214e33-c29a-4c93-8bfb-6c75503f3c01',
    ],
    names: ['Marché - Entertainment Complex', 'Marché Đà Lạt - Beer Garden'],
    same: false,
    why: 'two street addresses: 1 Nguyễn Thị Minh Khai and 30 khu Hoà Bình',
  },
  {
    refs: [
      'overture:10795ca3-30ad-4f7f-afd8-431d4606a75d',
      'overture:f2ef2307-70f4-45f5-becd-6b5560bd7a76',
    ],
    names: ['Ben xe Phuong Trang Da Lat', 'Bến Xe Liên Tỉnh Đà Lạt'],
    same: false,
    why: 'both on Tô Hiến Thành, 40 m apart, but only one record has a house number and neither a Wikidata item',
  },
  {
    refs: [
      'overture:10795ca3-30ad-4f7f-afd8-431d4606a75d',
      'overture:8423104e-59ca-4a58-94b7-a81f88691c23',
    ],
    names: ['Ben xe Phuong Trang Da Lat', 'Futa Buslines Terminal, Dalat City'],
    same: false,
    why: 'the same point, but the second record has no address and neither a Wikidata item',
  },
  {
    refs: [
      'overture:5fe09860-523d-4926-9f5e-d3d6da0212dc',
      'overture:92b0d8af-3371-49f2-9083-51c5178a8271',
    ],
    names: ['Hủ Tíu Hồng (29 Lê Quý Đôn)', 'Hủ Tiếu Gà Hồng (cuối đường Lê Quý Đôn)'],
    same: false,
    why: 'the same street, 100 m apart, but only one record has a house number',
  },
  {
    refs: ['fsq_os:55169c31498eb8bdba98552f', 'overture:95aff846-2329-41bc-98fa-b4818471a08a'],
    names: ['Lẩu Bò Ba Toa Quán Gỗ', 'Quán 27 - Lầu Bò Ba Toa'],
    same: false,
    why: 'both on Hoàng Diệu under two shop names, neither record with a house number',
  },
];
