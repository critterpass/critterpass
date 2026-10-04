/**
 * Places each destination's curated set always holds (see kinds/places/pins.ts), by the name the
 * open data uses and a point at the real place. Đà Nẵng's list is the itinerary of the first crew
 * trip there (stay, day plans, airport) plus the city's landmarks and well-known local food.
 * Đà Lạt's list is the sights the landmark step does not reach and the town's cafés and food.
 */
import type { LeftOutPlace, PinnedPlace } from '../kinds/places/pins';

export const PINNED_PLACES: Readonly<Record<string, readonly PinnedPlace[]>> = {
  'da-nang': [
    // Stay, arrival and departure.
    { name: 'Avatar Danang Hotel', lat: 16.0496, lng: 108.2472 },
    { name: 'Da Nang International Airport', lat: 16.0528, lng: 108.2029 },
    // Sơn Trà: the chessboard peak, Lady Buddha at Bãi Bụt and the Đồng Đình museum.
    { name: 'Đỉnh Bàn Cờ-Núi Sơn Trà', lat: 16.1189, lng: 108.2721 },
    { name: 'Chùa Linh Ứng (Linh Ung Pagoda)', lat: 16.0998, lng: 108.2777 },
    { name: 'Bảo tàng Đồng Đình', lat: 16.0989, lng: 108.2759 },
    { name: 'Sơn Trà Peninsula', lat: 16.1129, lng: 108.3093 },
    // City landmarks, beach and markets.
    { name: 'My Khe Beach', lat: 16.0631, lng: 108.2459 },
    { name: 'Dragon Bridge', lat: 16.0611, lng: 108.2277 },
    { name: 'Ngũ Hành Sơn (Marble Mountain)', lat: 16.0034, lng: 108.2644 },
    { name: 'Chợ Cồn (Con Market)', lat: 16.0683, lng: 108.2144 },
    { name: 'Chợ Hàn (Han Market)', lat: 16.0683, lng: 108.224 },
    // Hội An.
    { name: 'Hoi An Ancient Town', lat: 15.8782, lng: 108.3282 },
    { name: 'Chợ Hội An', lat: 15.8773, lng: 108.3312 },
    // Water.
    {
      name: 'Chèo SUP Đà Nẵng - Danang Stand Up Paddle Board Tours & Rentals',
      lat: 16.0884,
      lng: 108.2492,
    },
    // Local food and a beachside coffee.
    { name: 'Bánh Xèo Bà Dưỡng', lat: 16.0588, lng: 108.2161 },
    { name: 'Mì Quảng Bà Mua', lat: 16.066, lng: 108.2192 },
    { name: 'Bún Chả Cá Ông Tạ 113A Nguyễn Chí Thanh', lat: 16.0741, lng: 108.2208 },
    { name: 'Nhà hàng Madame Lân', lat: 16.0814, lng: 108.2233 },
    { name: 'Bếp Hên', lat: 16.064, lng: 108.221 },
    { name: 'Quán Bé Mặn', lat: 16.0829, lng: 108.2476 },
    { name: 'Hải Sản Năm Đảnh', lat: 16.1028, lng: 108.2527 },
    { name: 'Cộng Cà Phê', lat: 16.049, lng: 108.245 },
    { name: 'Beach Front Cafe', lat: 16.0564, lng: 108.2474 },
  ],
  'vn-da-lat': [
    // Sights the landmark list misses or matches to a record at the wrong point.
    { name: 'Biệt Thự Hằng Nga - Crazy House Đà Lạt', lat: 11.9347, lng: 108.4308 },
    { name: 'Dalat Market', lat: 11.9426, lng: 108.437 },
    { name: 'Chợ Đêm Đà Lạt (Dalat Night Market)', lat: 11.9423, lng: 108.437 },
    { name: 'Dinh Bao Dai III', lat: 11.9302, lng: 108.4293 },
    { name: 'Lam Dong Museum', lat: 11.9408, lng: 108.4598 },
    { name: 'Da Lat Pedagogy College', lat: 11.9463, lng: 108.4525 },
    { name: 'Quảng Trường Lâm Viên', lat: 11.939, lng: 108.445 },
    { name: 'Đồi Đa Phú', lat: 11.9813, lng: 108.4055 },
    { name: 'Fresh Garden', lat: 11.946, lng: 108.4082 },
    // Cafés: the town is known for them.
    { name: 'An Cafe', lat: 11.9417, lng: 108.4337 },
    { name: 'Là Việt Coffee', lat: 11.9568, lng: 108.4351 },
    { name: "K'Ho Coffee", lat: 12.0097, lng: 108.4129 },
    { name: 'Bùi Văn Ngọ Coffee', lat: 11.9248, lng: 108.4469 },
    { name: 'Horizon Coffee', lat: 11.9235, lng: 108.4483 },
    { name: 'Lưng Chừng', lat: 11.9209, lng: 108.4472 },
    { name: 'Dalat Nights Café', lat: 11.926, lng: 108.4453 },
    { name: 'Lululola', lat: 11.9201, lng: 108.442 },
    { name: 'Mây Lang Thang', lat: 11.9414, lng: 108.4658 },
    { name: 'Still Cafe', lat: 11.9443, lng: 108.4544 },
    { name: 'Tiệm Cà Phê Túi Mơ To', lat: 11.9411, lng: 108.4836 },
    { name: 'Tiệm Cà Phê Cheo Veooo', lat: 11.9381, lng: 108.4822 },
    { name: 'Kong cafe Dalat', lat: 11.9364, lng: 108.4834 },
    { name: 'Panorama Dalat Cafe', lat: 11.9467, lng: 108.4901 },
    { name: 'Da Lat Mountain View', lat: 11.9387, lng: 108.4633 },
    { name: 'In The Forest Đà Lạt', lat: 11.9283, lng: 108.4548 },
    { name: 'Tiệm cà phê Nhà Bên Suối', lat: 11.9023, lng: 108.4444 },
    { name: 'The Married Beans', lat: 11.9423, lng: 108.4228 },
    { name: 'Bicycle Up', lat: 11.9449, lng: 108.4348 },
    { name: 'one more cafe', lat: 11.9441, lng: 108.4331 },
    // Local food and sweets.
    { name: 'Liên Hoa Bakery', lat: 11.943, lng: 108.435 },
    { name: 'Quán Hoa Sữa', lat: 11.9436, lng: 108.4354 },
    { name: 'Chè Hé', lat: 11.9428, lng: 108.4352 },
    { name: 'Bánh tráng nướng Dì Đinh', lat: 11.9428, lng: 108.4286 },
    { name: 'Lẩu Bò Ba Toa Quán Gỗ', lat: 11.9414, lng: 108.4295 },
    { name: 'Góc Hà Thành', lat: 11.944, lng: 108.4347 },
    { name: 'artist alley restaurant', lat: 11.9465, lng: 108.4353 },
    { name: 'Le Chalet Dalat Cafe & Bistro', lat: 11.9349, lng: 108.4309 },
    { name: 'Le Rabelais', lat: 11.9377, lng: 108.4405 },
  ],
};

/**
 * Records the curated set never takes (by open-data name and the record's own point), each with
 * the reason the review page shows: a point far from the real place, a second record of a place
 * the set already holds, or a seller rather than a place to visit.
 */
export const LEFT_OUT_PLACES: Readonly<Record<string, readonly LeftOutPlace[]>> = {
  'vn-da-lat': [
    // Points far from the real place (checked against Wikidata or the street address).
    {
      name: 'Lien Khuong International Airport',
      lat: 11.946,
      lng: 108.475,
      why: 'the record sits in town, 25 km north of the airport (Wikidata 11.75, 108.37), which lies beyond the imported area',
    },
    {
      name: 'Du lịch Thung Lũng Tình Yêu - Đà Lạt',
      lat: 11.941,
      lng: 108.434,
      why: 'the record sits in the town centre, 4 km from the valley; the set holds Thung lũng Tình yêu',
    },
    {
      name: 'Valley of Love, Dalat City',
      lat: 11.942,
      lng: 108.438,
      why: 'the record sits in the town centre, 4 km from the valley; the set holds Thung lũng Tình yêu',
    },
    {
      name: 'Du lịch Hồ Xuân Hương - Đà Lạt',
      lat: 11.954,
      lng: 108.477,
      why: 'the record sits at Than Thở Lake, 3 km from Xuân Hương Lake, which the set holds',
    },
    {
      name: 'CHỢ ĐÀ LẠT',
      lat: 11.937,
      lng: 108.445,
      why: 'the record sits 1 km from the market; the set holds Dalat Market',
    },
    {
      name: 'Chợ Đà Lạt - Chợ Âm Phú Đà Lạt - Đặc sản Đà Lạt',
      lat: 11.934,
      lng: 108.434,
      why: 'the record sits 1 km from the market; the set holds Dalat Market and the night market',
    },
    {
      name: 'Golden Valley',
      lat: 11.98,
      lng: 108.403,
      why: 'the record sits 3 km from the valley (Wikidata 12.006, 108.381); the set holds Thung lũng Vàng',
    },
    {
      name: 'Làng Hoa Vạn Thành',
      lat: 11.94,
      lng: 108.435,
      why: 'the record sits in the town centre; the set holds the flower village record in Vạn Thành',
    },
    {
      name: 'Chùa Thiên Vương Cổ Sát - Đà Lạt - Lâm Đồng',
      lat: 11.94,
      lng: 108.459,
      why: 'the record sits 1 km from the pagoda (Wikidata 11.931, 108.460); the set holds Chùa Tàu',
    },
    {
      name: 'Thác Hang Cọp',
      lat: 11.946,
      lng: 108.436,
      why: 'the record sits in the town centre, where there is no waterfall',
    },
    {
      name: 'Cổng Trời Lâm Đồng',
      lat: 11.941,
      lng: 108.432,
      why: 'a point in the town centre under a province-wide name; no source says what it is',
    },
    // Further records of a place the set already holds.
    {
      name: 'Đèo Prenn - Đà Lạt',
      lat: 11.891,
      lng: 108.461,
      why: 'a second record of the Prenn pass',
    },
    {
      name: 'Lycee Yersin',
      lat: 11.945,
      lng: 108.453,
      why: 'a second record of the Pedagogy College (the former Lycée Yersin)',
    },
    {
      name: 'Quảng trường Lâm Viên',
      lat: 11.935,
      lng: 108.443,
      why: 'a second record of Lâm Viên Square, filed under nightlife',
    },
    {
      name: 'Vườn Hoa Thành Phố Đà Lạt',
      lat: 11.95,
      lng: 108.45,
      why: 'a second record of the flower garden, filed under nightlife',
    },
    {
      name: 'Vườn Hoa Đà Lạt',
      lat: 11.933,
      lng: 108.428,
      why: 'a second record of the flower garden, 3 km from it',
    },
    {
      name: 'Lien Hoa Bakery',
      lat: 11.939,
      lng: 108.438,
      why: 'a second record of Liên Hoa Bakery',
    },
    {
      name: 'The Married Bean',
      lat: 11.945,
      lng: 108.436,
      why: 'a second record of The Married Beans',
    },
    ...[
      { name: 'Lẩu gà lá é Tao Ngộ chính gốc', lat: 11.938, lng: 108.434 },
      { name: 'Lẩu Gà Lá É Tao Ngộ - Đà Lạt', lat: 11.949, lng: 108.438 },
      {
        name: 'lau ga la e Tao ngo. dc 30 Bùi Thị Xuân,  Phường xuân hương-da lat',
        lat: 11.949,
        lng: 108.439,
      },
      { name: 'Chi Nhánh Lẩu Gà Lá É Tao Ngộ', lat: 11.961, lng: 108.442 },
      { name: 'Tao Ngộ Lẩu Gà Lá É', lat: 11.931, lng: 108.446 },
    ].map((place) => ({
      ...place,
      why: 'one of seven records of Tao Ngộ; the set keeps the two that carry a street address',
    })),
    {
      name: 'Nhà Xe Phương Trang',
      lat: 11.941,
      lng: 108.431,
      why: "a bus company's office; the set holds the bus station",
    },
    {
      name: 'Sinh Tourist Bus Stop',
      lat: 11.944,
      lng: 108.44,
      why: "a tour company's pick-up point",
    },
    // Sellers and workshops rather than places to visit.
    ...[
      { name: 'Mắc ca Lâm Đồng đạt Tiêu Chuẩn OCOP', lat: 11.946, lng: 108.434 },
      { name: 'Trung Tâm Hỗ Trợ Du Lịch Thành Phố Đà Lạt', lat: 11.96, lng: 108.424 },
      { name: 'Cơ Sở Sản Xuất Rượu Cần Hoà Bình', lat: 11.928, lng: 108.443 },
      { name: 'Rượu Cần Cao Nguyên', lat: 11.936, lng: 108.424 },
      { name: 'Sỉ Lẻ Cơm Lam - Gà Nướng Đà Lạt', lat: 11.93, lng: 108.447 },
      { name: 'Nông Sản Sạch - Qùa Đà Lạt', lat: 11.931, lng: 108.428 },
      { name: 'Tiên Tiên shop - cửa hàng đặc sản Đà Lạt', lat: 11.94, lng: 108.458 },
      { name: 'Ngọc Phúc - Đặc sản Đà Lạt', lat: 11.973, lng: 108.441 },
      { name: 'Đặc Sản Đà Lạt - Beefarm', lat: 11.938, lng: 108.445 },
      { name: 'Dâu Sấy Đà Lạt', lat: 11.975, lng: 108.439 },
      { name: 'Cao Atiso Đà Lạt', lat: 11.93, lng: 108.433 },
      { name: 'Van Phong Tranh Nghe Thuat MP Woor Arts', lat: 11.944, lng: 108.434 },
      { name: 'Xưởng Hồng Treo Gió Nhất Hạnh', lat: 11.936, lng: 108.446 },
      { name: 'Đông Trùng Hạ Thảo Dalat Newfarm', lat: 11.975, lng: 108.453 },
      { name: 'Vựa dâu Hồng', lat: 11.956, lng: 108.434 },
      { name: 'Sen Đá Sưu Tầm', lat: 11.938, lng: 108.445 },
    ].map((place) => ({ ...place, why: 'a producer, shop or office, not a place to visit' })),
    // The selection took a dozen strawberry gardens and five succulent gardens.
    ...[
      { name: 'Vườn Dâu Đà Lạt', lat: 11.959, lng: 108.424 },
      { name: 'Vườn Dâu Đà Lạt - Thời Thìn', lat: 12.001, lng: 108.408 },
      { name: 'Vườn Dâu Duyên Anh', lat: 11.916, lng: 108.434 },
      { name: 'Vườn dâu Khải Farm', lat: 11.972, lng: 108.431 },
      { name: 'vườn dâu Khánh Ngọc', lat: 11.973, lng: 108.431 },
      { name: 'Vườn dâu Quyền Thu', lat: 11.963, lng: 108.454 },
      { name: 'Vườn Dâu Quyền Thu', lat: 11.945, lng: 108.427 },
      { name: 'Vườn dâu Chân Mây- Dâu Tây Đà Lạt', lat: 11.952, lng: 108.508 },
      { name: 'Vườn dâu Mr.Bin', lat: 11.917, lng: 108.432 },
      { name: 'Dozoro - Vườn Sen Đá & Cây Mọng Nước', lat: 11.927, lng: 108.434 },
      { name: 'Sen Đá AT- Vườn sen đá bên suối', lat: 11.93, lng: 108.418 },
      { name: 'Vườn sen đá Đức Huy', lat: 11.962, lng: 108.432 },
    ].map((place) => ({
      ...place,
      why: 'one of many strawberry and succulent gardens the selection took; the set keeps a few of each',
    })),
  ],
};
