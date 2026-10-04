/**
 * The Đà Lạt records the curated set never takes, each with the reason the review page prints: a
 * point far from the real place, a further record of a place the set holds, a seller rather than
 * a place to visit.
 */
import type { LeftOutPlace } from '../kinds/places/pins';

export const DA_LAT_LEFT_OUT: readonly LeftOutPlace[] = [
  // Points far from the real place (checked against Wikidata or the street address).
  {
    name: 'Lien Khuong International Airport',
    lat: 11.946,
    lng: 108.475,
    why: 'the record sits in town, 25 km from the airport (Wikidata 11.75, 108.37); no airport place is needed, since a flight booking carries its own airport',
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
];
