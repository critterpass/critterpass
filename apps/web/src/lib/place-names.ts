/* eslint-disable lingui/no-unlocalized-strings -- place names are data, not UI copy. */
/**
 * What each language calls the places the coming-soon page names: the critter catalogue's cities
 * (the six guides' homes, the hatch pool and the ticker among them). A language gets its own name
 * where one is in common use (京都, Sevilla, Nueva York) and the original everywhere else. One row
 * per place: `original|zh-Hans|id|ja|es|pt|fr|ko|th|vi`, an empty cell meaning "the original".
 * Airport cities outside the catalogue are not listed and keep the airports dataset's names.
 */
const COLUMNS = ['zh-Hans', 'id', 'ja', 'es', 'pt', 'fr', 'ko', 'th', 'vi'] as const;

const TABLE = `
Hà Nội|河内|Hanoi|ハノイ|Hanói|Hanói|Hanoï|하노이|ฮานอย|
Hạ Long|下龙湾||ハロン湾||||하롱베이|ฮาลอง|
Sa Pa|沙坝||サパ||||사파|ซาปา|
Huế|顺化||フエ||||후에|เว้|
Hội An|会安||ホイアン||||호이안|ฮอยอัน|
Đà Lạt|大叻||ダラット||||달랏|ดาลัด|
Sài Gòn|西贡|Saigon|サイゴン|Saigón|Saigon|Saïgon|사이공|ไซง่อน|
Mekong|湄公河||メコン|||Mékong|메콩|แม่โขง|Mê Kông
Phú Quốc|富国岛||フーコック||||푸꾸옥|ฟูก๊วก|
Phong Nha|风牙||フォンニャ||||퐁냐|ฟองญา|
Đà Nẵng|岘港||ダナン||||다낭|ดานัง|
Paris|巴黎||パリ|París|||파리|ปารีส|
Nice|尼斯||ニース|Niza|||니스|นีซ|
Lyon|里昂||リヨン||||리옹|ลียง|
Marseille|马赛||マルセイユ|Marsella|Marselha||마르세유|มาร์แซย์|
Strasbourg|斯特拉斯堡||ストラスブール|Estrasburgo|Estrasburgo||스트라스부르|สทราซบูร์|
Barcelona|巴塞罗那||バルセロナ|||Barcelone|바르셀로나|บาร์เซโลนา|
Madrid|马德里||マドリード||Madri||마드리드|มาดริด|
Seville|塞维利亚|Sevilla|セビリア|Sevilla|Sevilha|Séville|세비야|เซบียา|Sevilla
Mallorca|马略卡岛||マヨルカ島||Maiorca|Majorque|마요르카|มายอร์กา|
Tenerife|特内里费岛||テネリフェ島|||Ténérife|테네리페|เตเนรีเฟ|
New York|纽约||ニューヨーク|Nueva York|Nova York||뉴욕|นิวยอร์ก|
Los Angeles|洛杉矶||ロサンゼルス|Los Ángeles|||로스앤젤레스|ลอสแอนเจลิส|
Las Vegas|拉斯维加斯||ラスベガス||||라스베이거스|ลาสเวกัส|
Orlando|奥兰多||オーランド||||올랜도|ออร์แลนโด|
Honolulu|檀香山||ホノルル|Honolulú|||호놀룰루|โฮโนลูลู|
Beijing|北京||北京|Pekín|Pequim|Pékin|베이징|ปักกิ่ง|Bắc Kinh
Shanghai|上海||上海|Shanghái|Xangai||상하이|เซี่ยงไฮ้|Thượng Hải
Xi'an|西安||西安||||시안|ซีอาน|Tây An
Chengdu|成都||成都||||청두|เฉิงตู|Thành Đô
Guilin|桂林||桂林||||구이린|กุ้ยหลิน|Quế Lâm
Istanbul|伊斯坦布尔||イスタンブール|Estambul|Istambul||이스탄불|อิสตันบูล|
Antalya|安塔利亚||アンタルヤ||||안탈리아|อันตัลยา|
Cappadocia|卡帕多奇亚|Kapadokia|カッパドキア|Capadocia|Capadócia|Cappadoce|카파도키아|คัปปาโดเกีย|
Bodrum|博德鲁姆||ボドルム||||보드룸|โบดรัม|
Izmir|伊兹密尔||イズミル|Esmirna|Esmirna||이즈미르|อิซเมียร์|
Rome|罗马|Roma|ローマ|Roma|Roma||로마|โรม|Roma
Venice|威尼斯|Venesia|ベネチア|Venecia|Veneza|Venise|베네치아|เวนิส|
Florence|佛罗伦萨||フィレンツェ|Florencia|Florença||피렌체|ฟลอเรนซ์|
Milan|米兰||ミラノ|Milán|Milão||밀라노|มิลาน|
Capri|卡普里岛||カプリ島||||카프리|คาปรี|
Mexico City|墨西哥城|Kota Meksiko|メキシコシティ|Ciudad de México|Cidade do México|Mexico|멕시코시티|เม็กซิโกซิตี|Thành phố Mexico
Cancún|坎昆||カンクン||||칸쿤|แคนคูน|
Oaxaca|瓦哈卡||オアハカ||||오악사카|วาฮากา|
Tulum|图卢姆||トゥルム||||툴룸|ตูลุม|
Guadalajara|瓜达拉哈拉||グアダラハラ||||과달라하라|กัวดาลาฮารา|
Victoria Peak|太平山顶||ビクトリア・ピーク||||빅토리아 피크|วิกตอเรียพีก|
Kowloon|九龙||九龍||||구룡|เกาลูน|Cửu Long
Mong Kok|旺角||モンコック||||몽콕|มงก๊ก|
Lantau|大屿山||ランタオ島||||란타우|ลันเตา|
Lamma|南丫岛||ラマ島||||라마섬|ลัมมา|
London|伦敦||ロンドン|Londres|Londres|Londres|런던|ลอนดอน|
Edinburgh|爱丁堡||エディンバラ|Edimburgo|Edimburgo|Édimbourg|에든버러|เอดินบะระ|
Loch Ness|尼斯湖||ネス湖|Lago Ness|Lago Ness||네스호|ล็อกเนสส์|Hồ Loch Ness
Manchester|曼彻斯特||マンチェスター||||맨체스터|แมนเชสเตอร์|
Lake District|湖区||湖水地方||||레이크 디스트릭트|เลกดิสทริกต์|
Berlin|柏林||ベルリン|Berlín|Berlim||베를린|เบอร์ลิน|
Munich|慕尼黑||ミュンヘン|Múnich|Munique||뮌헨|มิวนิก|
Hamburg|汉堡||ハンブルク|Hamburgo|Hamburgo|Hambourg|함부르크|ฮัมบูร์ก|
Black Forest|黑森林|Hutan Hitam|黒い森|Selva Negra|Floresta Negra|Forêt-Noire|슈바르츠발트|ป่าดำ|Rừng Đen
Neuschwanstein|新天鹅堡||ノイシュヴァンシュタイン城||||노이슈반슈타인성|นอยชวานชไตน์|
Kyoto|京都||京都|Kioto|Quioto||교토|เกียวโต|
Tokyo|东京||東京|Tokio|Tóquio||도쿄|โตเกียว|
Osaka|大阪||大阪||||오사카|โอซากะ|
Athens|雅典|Athena|アテネ|Atenas|Atenas|Athènes|아테네|เอเธนส์|
Crete|克里特岛|Kreta|クレタ島|Creta|Creta|Crète|크레타|ครีต|
Mykonos|米科诺斯岛||ミコノス島|Miconos|||미코노스|มิโคนอส|
Bangkok|曼谷||バンコク||||방콕|กรุงเทพฯ|
Chiang Mai|清迈||チェンマイ||||치앙마이|เชียงใหม่|
Phuket|普吉岛||プーケット||||푸껫|ภูเก็ต|
Vienna|维也纳|Wina|ウィーン|Viena|Viena|Vienne|빈|เวียนนา|Viên
Salzburg|萨尔茨堡||ザルツブルク|Salzburgo|Salzburgo|Salzbourg|잘츠부르크|ซาลซ์บูร์ก|
Innsbruck|因斯布鲁克||インスブルック||||인스브루크|อินส์บรุค|
Riyadh|利雅得||リヤド|Riad|Riade|Riyad|리야드|ริยาด|
AlUla|欧拉||アルウラ||||알울라|อัลอูลา|
Jeddah|吉达||ジッダ|Yeda|Jidá|Djeddah|제다|เจดดาห์|
Lisbon|里斯本||リスボン|Lisboa|Lisboa|Lisbonne|리스본|ลิสบอน|
Porto|波尔图||ポルト|Oporto|||포르투|ปอร์โต|
Algarve|阿尔加维||アルガルヴェ||||알가르브|อัลการ์ฟ|
Kuala Lumpur|吉隆坡||クアラルンプール||||쿠알라룸푸르|กัวลาลัมเปอร์|
Langkawi|兰卡威||ランカウイ島||||랑카위|ลังกาวี|
Borneo|婆罗洲||ボルネオ島|||Bornéo|보르네오|บอร์เนียว|
Amsterdam|阿姆斯特丹||アムステルダム|Ámsterdam|Amsterdã||암스테르담|อัมสเตอร์ดัม|
Keukenhof|库肯霍夫||キューケンホフ||||쾨켄호프|เคอเคนฮอฟ|
Giethoorn|羊角村||ヒートホールン||||히트호른|กีธูร์น|
Toronto|多伦多||トロント||||토론토|โทรอนโต|
Vancouver|温哥华||バンクーバー||||밴쿠버|แวนคูเวอร์|
Banff|班夫||バンフ||||밴프|แบมฟ์|
Kraków|克拉科夫|Krakow|クラクフ|Cracovia|Cracóvia|Cracovie|크라쿠프|กรากุฟ|
Warsaw|华沙|Warsawa|ワルシャワ|Varsovia|Varsóvia|Varsovie|바르샤바|วอร์ซอ|
Gdańsk|格但斯克||グダニスク||||그단스크|กดัญสก์|
Dubrovnik|杜布罗夫尼克||ドゥブロヴニク||||두브로브니크|ดูบรอฟนิก|
Split|斯普利特||スプリト||||스플리트|สปลิต|
Plitvice|普利特维采||プリトヴィツェ||||플리트비체|พลิตวิเซ|
Dubai|迪拜||ドバイ|Dubái||Dubaï|두바이|ดูไบ|
Abu Dhabi|阿布扎比||アブダビ|Abu Dabi||Abou Dabi|아부다비|อาบูดาบี|
Sharjah|沙迦||シャルジャ|Sarja||Charjah|샤르자|ชาร์จาห์|
Marrakech|马拉喀什||マラケシュ||||마라케시|มาร์ราเกช|
Chefchaouen|舍夫沙万||シャウエン||||셰프샤우엔|เชฟชาอูน|
Merzouga|梅尔祖卡||メルズーガ||||메르주가|เมอร์ซูกา|
Budapest|布达佩斯||ブダペスト||Budapeste||부다페스트|บูดาเปสต์|
Balaton|巴拉顿湖||バラトン湖||||벌러톤호|บอลอโตน|
Hortobágy|霍尔托巴吉||ホルトバージ||||호르토바지||
Marina Bay|滨海湾||マリーナベイ||||마리나 베이|มารีนาเบย์|
Sentosa|圣淘沙||セントーサ島||||센토사|เซ็นโตซา|
Sungei Buloh|双溪布洛||スンゲイ・ブロー||||숭게이 불로||
Seoul|首尔||ソウル|Seúl|Seul|Séoul|서울|โซล|
Busan|釜山||釜山|Busán|||부산|ปูซาน|
Jeju|济州岛||済州島||||제주|เชจู|
Cairo|开罗|Kairo|カイロ|El Cairo||Le Caire|카이로|ไคโร|
Luxor|卢克索||ルクソール|Lúxor||Louxor|룩소르|ลักซอร์|
Aswan|阿斯旺||アスワン|Asuán|Assuã|Assouan|아스완|อัสวาน|
Bali|巴厘岛||バリ島||||발리|บาหลี|
Labuan Bajo|纳闽巴霍||ラブアンバジョ||||라부안바조|ลาบวนบาโจ|
Yogyakarta|日惹||ジョグジャカルタ||||족자카르타|ยอกยาการ์ตา|
Lucerne|卢塞恩|Luzern|ルツェルン|Lucerna|Lucerna||루체른|ลูเซิร์น|
Zermatt|采尔马特||ツェルマット||||체르마트|เซอร์แมท|
Interlaken|因特拉肯||インターラーケン||||인터라켄|อินเทอร์ลาเคิน|
Prague|布拉格|Praha|プラハ|Praga|Praga||프라하|ปราก|Praha
Český Krumlov|克鲁姆洛夫||チェスキー・クルムロフ||||체스키크룸로프|เชสกีครุมลอฟ|
Karlovy Vary|卡罗维发利||カルロヴィ・ヴァリ||||카를로비바리|คาร์โลวีวารี|
Tirana|地拉那||ティラナ||||티라나|ติรานา|
Sidi Bou Said|西迪布赛义德||シディ・ブ・サイド||||시디부사이드|ซิดิบูซาอิด|
Jaipur|斋浦尔||ジャイプル||||자이푸르|ชัยปุระ|
Bruges|布鲁日|Brugge|ブルージュ|Brujas|||브뤼허|บรูช|
Cape Town|开普敦||ケープタウン|Ciudad del Cabo|Cidade do Cabo|Le Cap|케이프타운|เคปทาวน์|
Samaná|萨马纳||サマナ||||사마나|ซามานา|
Samarkand|撒马尔罕||サマルカンド|Samarcanda|Samarcanda|Samarcande|사마르칸트|ซามาร์คันด์|
Taipei|台北||台北|Taipéi|Taipé||타이베이|ไทเป|Đài Bắc
Sydney|悉尼||シドニー|Sídney|||시드니|ซิดนีย์|
Dublin|都柏林||ダブリン|Dublín|||더블린|ดับลิน|
Stockholm|斯德哥尔摩||ストックホルム|Estocolmo|Estocolmo||스톡홀름|สต็อกโฮล์ม|
Siem Reap|暹粒||シェムリアップ||||시엠립|เสียมราฐ|Xiêm Riệp
Rio de Janeiro|里约热内卢||リオデジャネイロ|Río de Janeiro|||리우데자네이루|รีโอเดจาเนโร|
Buenos Aires|布宜诺斯艾利斯||ブエノスアイレス||||부에노스아이레스|บัวโนสไอเรส|
Cartagena|卡塔赫纳||カルタヘナ|||Carthagène|카르타헤나|การ์ตาเฮนา|
Bohol|薄荷岛||ボホール島||||보홀|โบโฮล|
Petra|佩特拉||ペトラ|||Pétra|페트라|เปตรา|
Torres del Paine|百内||トーレス・デル・パイネ||||토레스델파이네|ตอร์เรสเดลไปเน|
Doha|多哈||ドーハ||||도하|โดฮา|
Tbilisi|第比利斯||トビリシ|Tiflis||Tbilissi|트빌리시|ทบิลิซี|
Tromsø|特罗姆瑟||トロムソ||||트롬쇠|ทรอมเซอ|
Luang Prabang|琅勃拉邦||ルアンパバーン||||루앙프라방|หลวงพระบาง|Luông Pha Băng
Muscat|马斯喀特||マスカット|Mascate|Mascate|Mascate|무스카트|มัสกัต|
Queenstown|皇后镇||クイーンズタウン||||퀸스타운|ควีนส์ทาวน์|
Cusco|库斯科||クスコ||||쿠스코|กุสโก|
La Fortuna|拉福尔图纳||ラ・フォルトゥナ||||라포르투나|ลาฟอร์ตูนา|
Nairobi|内罗毕||ナイロビ||||나이로비|ไนโรบี|
Reykjavík|雷克雅未克||レイキャビク|Reikiavik|Reykjavik|Reykjavik|레이캬비크|เรคยาวิก|
Havana|哈瓦那||ハバナ|La Habana||La Havane|아바나|ฮาวานา|
Serengeti|塞伦盖蒂||セレンゲティ||||세렝게티|เซเรนเกติ|
Iceland|冰岛|Islandia|アイスランド|Islandia|Islândia|Islande|아이슬란드|ไอซ์แลนด์|
`;

interface PlaceNames {
  /** The name as the data writes it (`Hà Nội`). */
  readonly original: string;
  readonly byLocale: Readonly<Record<string, string>>;
}

/** Keyed by the original name in capitals, so `HÀ NỘI` (the ticker, the hatch pool) finds `Hà Nội`. */
const NAMES: ReadonlyMap<string, PlaceNames> = new Map(
  TABLE.trim()
    .split('\n')
    .map((line) => {
      const [original = '', ...cells] = line.split('|');
      const byLocale: Record<string, string> = {};
      COLUMNS.forEach((locale, index) => {
        const name = cells[index];
        if (name !== undefined && name !== '') byLocale[locale] = name;
      });
      return [original.toUpperCase(), { original, byLocale }] as const;
    }),
);

/**
 * The name `locale` uses for a place. A place with no name of its own in that language keeps the
 * original; a place outside the table keeps the name given.
 */
export function placeName(original: string, locale: string): string {
  const entry = NAMES.get(original.toUpperCase());
  if (entry === undefined) return original;
  return entry.byLocale[locale] ?? entry.original;
}

/** As {@link placeName}, in capitals the way `locale` writes them (no-op for scripts without case). */
export function placeNameUpper(original: string, locale: string): string {
  return placeName(original, locale).toLocaleUpperCase(locale);
}

/** Every original name with an entry (for tests). */
export function knownPlaceNames(): string[] {
  return [...NAMES.values()].map((entry) => entry.original);
}
