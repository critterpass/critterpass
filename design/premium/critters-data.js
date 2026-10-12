// Critterpass collection data: 61 places, 150 locals. One critter per city.
// tier 0 = Vietnam (home set), 1 = ranks 1–10 (5 each), 2 = ranks 11–30 (3 each), 3 = ranks 31–60 (1 each).
// Ranking: 2024 international arrivals (UN Tourism). Macau left out (mostly same-day trips); all six live guides are in.
(function () {
  if (window.CritterDex) return;
  const PL = [
    ['vn', 'Vietnam', 0, [
      ['Hà Nội', 'Cụ Rùa', 'Hoàn Kiếm turtle', { b: 'turtle', c: ['#b5d68f', '#5f9a55', '#eef5d6'], acc: 'sword' }],
      ['Hạ Long', 'Rồng', 'Bay dragon', { b: 'lizard', v: 'dragon', c: ['#54d6a4', '#2e9a74', '#dff7ea'] }],
      ['Sa Pa', 'Trâu', 'Water buffalo', { b: 'stand', v: 'buffalo', c: ['#948eb0', '#57517a', '#cfcae0'], horns: 'bull', ears: 'side2', acc: 'scarf', sc: '#4f86ff' }],
      ['Huế', 'Sao La', 'Saola', { b: 'stand', c: ['#b8744d', '#5a3424', '#fff1dc'], horns: 'straight', ears: 'deer', mask: 'saola' }],
      ['Hội An', 'Chép', 'Lantern carp', { b: 'fish', v: 'carp', c: ['#ff8a4d', '#e0502e', '#fff1dc'], pat: 'scales', acc: 'lantern' }],
      ['Đà Lạt', 'Ngựa', 'Flower pony', { b: 'stand', v: 'horse', c: ['#fff1d6', '#ff8fbf', '#fffaf0'], acc: 'flowers' }],
      ['Sài Gòn', 'Chào Mào', 'Red-whiskered bulbul', { b: 'bird', v: 'bulbul', c: ['#c9a882', '#3a3466', '#fffaf0'] }],
      ['Mekong', 'Cò', 'Egret', { b: 'wader', c: ['#fffaf0', '#e6dfcf', '#fffaf0'], beak: 'long', bc: '#ffd84a', lc: '#3a3466', acc: 'nonla' }],
      ['Phú Quốc', 'Xoáy', 'Phú Quốc ridgeback', { b: 'sit', c: ['#dba06a', '#a3683a', '#f6dcb4'], ears: 'cat', muz: 'dog', tail: 'thin', pat: 'ridge' }],
      ['Phong Nha', 'Dơi', 'Cave bat', { b: 'sit', v: 'bat', c: ['#a497dc', '#5d509e', '#ddd6f6'], ears: 'bat', ic: '#ffc2d6', tail: 'none' }],
    ]],
    ['fr', 'France', 1, [
      ['Paris', 'Roucou', 'Pigeon', { b: 'bird', v: 'pigeon', c: ['#bcc2da', '#7c84a8', '#dfe2ee'], acc: 'beret' }],
      ['Nice', 'Cigalou', 'Cicada', { b: 'bug', v: 'cicada', c: ['#ffd84a', '#c99a2a', '#fff3c4'] }],
      ['Lyon', 'Léon', 'Lion', { b: 'sit', c: ['#ffc46b', '#d0703a', '#fff1dc'], ears: 'round', mane: 1, muz: 'cat', tail: 'tuft' }],
      ['Marseille', 'Rascasse', 'Scorpionfish', { b: 'fish', v: 'tall', c: ['#ff6f5c', '#c63f3f', '#ffd9cc'], fins: 'spiky', pat: 'dots' }],
      ['Strasbourg', 'Stori', 'White stork', { b: 'wader', c: ['#fffaf0', '#3a3466', '#fffaf0'], beak: 'long', bc: '#ff5a3d', lc: '#ff5a3d' }],
    ]],
    ['es', 'Spain', 1, [
      ['Barcelona', 'Drac', 'Mosaic salamander', { b: 'lizard', c: ['#7fb8ff', '#3d6fe0', '#eef4ff'], pat: 'mosaic' }],
      ['Madrid', 'Osito', 'Brown bear', { b: 'sit', c: ['#bf7c52', '#6b3a24', '#f4d9b0'], ears: 'round', muz: 'dog', tail: 'stub', acc: 'berries' }],
      ['Seville', 'Lince', 'Iberian lynx', { b: 'sit', c: ['#e8b87a', '#8f5a3a', '#fff1dc'], ears: 'tuft', muz: 'cat', pat: 'spots', mask: 'beard', tail: 'stub' }],
      ['Mallorca', 'Ferreret', 'Midwife toad', { b: 'frog', c: ['#e3cc6c', '#6b5a24', '#fff6d0'], pat: 'spots' }],
      ['Tenerife', 'Canario', 'Canary', { b: 'bird', c: ['#ffd84a', '#e0a92a', '#fff6cc'], beak: 'cone' }],
    ]],
    ['us', 'United States', 1, [
      ['New York', 'Pizza', 'Subway rat', { b: 'sit', c: ['#bab4ca', '#7c75a0', '#e6e2f2'], ears: 'mouse', ic: '#ffc2d6', muz: 'rat', tail: 'rat', hy: 33, hw: .9, acc: 'pizza' }],
      ['Los Angeles', 'Coyo', 'Coyote', { b: 'sit', c: ['#dba06a', '#8f5a3a', '#fff1dc'], ears: 'fox', muz: 'long', tail: 'bushy', acc: 'shades' }],
      ['Las Vegas', 'Lucky', 'Jackrabbit', { b: 'sit', c: ['#e3c49c', '#9c7a5a', '#fffaf0'], ears: 'long', ic: '#ffb8c8', muz: 'bunny', tail: 'puff', hy: 40, hh: .9, acc: 'dice' }],
      ['Orlando', 'Gator', 'Alligator', { b: 'lizard', v: 'croc', c: ['#78b35e', '#3f7a3a', '#e2f2b8'] }],
      ['Honolulu', 'Humu', 'Reef triggerfish', { b: 'fish', v: 'tall', c: ['#ffd84a', '#3a3466', '#fff6cc'], pat: 'humu' }],
    ]],
    ['cn', 'China', 1, [
      ['Beijing', 'Jingba', 'Pekingese', { b: 'sit', c: ['#f2c98a', '#9c6a3f', '#fff1dc'], ears: 'flop', ec: '#c98a52', muz: 'flat', tail: 'plume', acc: 'knot' }],
      ['Shanghai', 'Xiexie', 'Hairy crab', { b: 'crab', c: ['#b0925e', '#5a4a2a', '#eadcb4'] }],
      ["Xi'an", 'Jinsi', 'Golden snub-nosed monkey', { b: 'sit', v: 'monkey', c: ['#ffc46b', '#d9703a', '#fff1dc'], ears: 'side', muz: 'snub', fcol: '#a8d4ff', tail: 'long', arms: 'long' }],
      ['Chengdu', 'Huahua', 'Giant panda', { b: 'sit', c: ['#fffaf0', '#3a3466', '#fffaf0'], ears: 'round', ec: '#3a3466', mask: 'panda', arms: 'dark', acc: 'bamboo', belly: 0 }],
      ['Guilin', 'Luci', 'Cormorant', { b: 'wader', v: 'float', c: ['#5d5780', '#3a3466', '#8d87a8'], beak: 'hook', bc: '#ffd84a' }],
    ]],
    ['tr', 'Türkiye', 1, [
      ['Istanbul', 'Tombili', 'Street cat', { b: 'sit', c: ['#c9cde0', '#8d93b0', '#fffaf0'], ears: 'cat', ic: '#ffb8c8', muz: 'cat', tail: 'thin', pat: 'tabby', bw: 24 }],
      ['Antalya', 'Caretta', 'Loggerhead turtle', { b: 'turtle', v: 'sea', c: ['#e8c29a', '#c4623e', '#fff1dc'] }],
      ['Cappadocia', 'Peri', 'Horse', { b: 'stand', v: 'horse', c: ['#c98a5a', '#5a3424', '#f4d9b0'], acc: 'balloon' }],
      ['Bodrum', 'Yunus', 'Bottlenose dolphin', { b: 'whale', v: 'dolphin', c: ['#86bdfb', '#3d6fe0', '#e6f2ff'] }],
      ['Izmir', 'Pembe', 'Flamingo', { b: 'wader', v: 'flamingo', c: ['#ff9cc8', '#ff5fa8', '#ffd9e8'], beak: 'flamingo', bc: '#fff1dc', lc: '#ff5fa8' }],
    ]],
    ['it', 'Italy', 1, [
      ['Rome', 'Lupa', 'She-wolf', { b: 'sit', c: ['#c9a27a', '#7a5a3f', '#f4e3c8'], ears: 'fox', muz: 'long', tail: 'bushy', acc: 'laurel' }],
      ['Venice', 'Seppia', 'Cuttlefish', { b: 'octo', c: ['#c9a6f0', '#7f5ac9', '#f0e6ff'], acc: 'boater' }],
      ['Florence', 'Porcellino', 'Bronze boar', { b: 'sit', c: ['#8f9a6a', '#5a6440', '#c9cc9a'], ears: 'pig', muz: 'snout', snc: '#ffd84a', tusks: 1, tail: 'curl', pat: 'bristle' }],
      ['Milan', 'Biscio', 'Crowned serpent', { b: 'snake', c: ['#54d6a4', '#2e9a74', '#dff7ea'], acc: 'crown' }],
      ['Capri', 'Azzurra', 'Blue lizard', { b: 'lizard', v: 'slim', c: ['#5b8fff', '#2f5fc9', '#dbe8ff'], pat: 'dots' }],
    ]],
    ['mx', 'Mexico', 1, [
      ['Mexico City', 'Ajo', 'Axolotl', { k: 'axolotl' }],
      ['Cancún', 'Tibu', 'Whale shark', { b: 'fish', v: 'shark', c: ['#7494d4', '#3d5fa8', '#e6eeff'], pat: 'wspots' }],
      ['Oaxaca', 'Chapulín', 'Grasshopper', { b: 'bug', v: 'hopper', c: ['#9cd66a', '#5a9a3a', '#e8f6c8'] }],
      ['Tulum', 'Coati', 'White-nosed coati', { b: 'sit', c: ['#c98a5a', '#6b3a24', '#f4d9b0'], ears: 'tiny', muz: 'longnose', tail: 'ring' }],
      ['Guadalajara', 'Xolo', 'Xoloitzcuintli', { b: 'sit', c: ['#8a83ad', '#4a4466', '#b3acd0'], ears: 'bat', ic: '#ffc2d6', muz: 'dog', tail: 'thin', acc: 'marigold', belly: 0 }],
    ]],
    ['hk', 'Hong Kong', 1, [
      ['Victoria Peak', 'Maying', 'Black kite', { b: 'bird', v: 'raptor', c: ['#a8764f', '#6b3a24', '#dcbc9c'], tail: 'fork' }],
      ['Kowloon', 'Malau', 'Rhesus macaque', { b: 'sit', v: 'monkey', c: ['#c9a27a', '#8f6a4d', '#f4e3c8'], ears: 'side', muz: 'monkey', fcol: '#ffb8a8', tail: 'stub' }],
      ['Mong Kok', 'Gamyu', 'Goldfish', { b: 'fish', v: 'gold', c: ['#ff9a4d', '#ff5a3d', '#fff1dc'], acc: 'bag' }],
      ['Lantau', 'Hoitun', 'Pink dolphin', { b: 'whale', v: 'dolphin', c: ['#ffb3cf', '#ff7fae', '#ffe6f0'] }],
      ['Lamma', 'Romer', "Romer's tree frog", { b: 'frog', v: 'tree', c: ['#cfa66e', '#8f6a3a', '#f4e3c8'] }],
    ]],
    ['gb', 'United Kingdom', 1, [
      ['London', 'Merlina', 'Tower raven', { b: 'bird', v: 'raven', c: ['#5d5780', '#2c2750', '#7a7399'], beak: 'raven', bc: '#3a3466', acc: 'crown' }],
      ['Edinburgh', 'Bobby', 'Skye terrier', { b: 'sit', c: ['#bcc2da', '#7c84a8', '#e2e5f0'], ears: 'flop', ec: '#9aa0bd', mask: 'fringe', muz: 'dog', tail: 'plume', acc: 'tartan' }],
      ['Loch Ness', 'Nessie', 'Loch Ness monster', { b: 'nessie', c: ['#54d6a4', '#2e9a74', '#dff7ea'] }],
      ['Manchester', 'Buzz', 'Worker bee', { b: 'bug', v: 'bee', c: ['#ffd84a', '#3a3466', '#fff6cc'] }],
      ['Lake District', 'Herdy', 'Herdwick lamb', { b: 'sit', v: 'sheep', c: ['#aaa4c2', '#6f698c', '#fffaf0'], hc: '#fffaf0', ears: 'sheep', ec: '#fffaf0' }],
    ]],
    ['de', 'Germany', 1, [
      ['Berlin', 'Buddy', 'Buddy bear', { b: 'sit', c: ['#ff8fbf', '#c94f86', '#ffd9e8'], ears: 'round', pose: 'cheer', pat: 'stars' }],
      ['Munich', 'Waldi', 'Dachshund', { b: 'stand', v: 'dachshund', c: ['#86bdfb', '#3d6fe0', '#fffaf0'], ears: 'flop', ec: '#3d6fe0', pat: 'waldi', tail: 'dog' }],
      ['Hamburg', 'Hein', 'Harbour seal', { b: 'seal', c: ['#bcc2da', '#7c84a8', '#e2e5f0'], pat: 'speckle', acc: 'sailor' }],
      ['Black Forest', 'Kucki', 'Cuckoo', { b: 'bird', c: ['#aaa4c2', '#6f698c', '#fffaf0'], pat: 'barred', acc: 'bollen' }],
      ['Neuschwanstein', 'Ludwig', 'Mute swan', { b: 'wader', v: 'swan', c: ['#fffaf0', '#e6dfcf', '#fffaf0'], beak: 'swan', bc: '#ff9a4d', acc: 'crown' }],
    ]],
    ['jp', 'Japan', 2, [
      ['Kyoto', 'Pon', 'Tanuki', { k: 'tanuki' }],
      ['Tokyo', 'Hachi', 'Akita', { b: 'sit', c: ['#ffb46b', '#c97a3a', '#fffaf0'], ears: 'cat', muz: 'dog', mask: 'akita', tail: 'curlup' }],
      ['Osaka', 'Fugu', 'Pufferfish', { b: 'fish', v: 'puffer', c: ['#ffe08a', '#c99a2a', '#fffaf0'], pat: 'dots' }],
    ]],
    ['gr', 'Greece', 2, [
      ['Athens', 'Koukou', 'Little owl', { b: 'bird', v: 'owl', c: ['#c9a27a', '#8f6a4d', '#f4e3c8'] }],
      ['Crete', 'Kri-kri', 'Cretan wild goat', { b: 'stand', c: ['#dba06a', '#8f5a3a', '#f4e3c8'], horns: 'back', ears: 'deer', beard: 1 }],
      ['Mykonos', 'Petros', 'Pelican', { b: 'wader', v: 'pelican', c: ['#fff1e6', '#e6d6c6', '#fffaf0'], beak: 'pouch', bc: '#ff9a4d', lc: '#ff9a4d' }],
    ]],
    ['th', 'Thailand', 2, [
      ['Bangkok', 'Plakad', 'Siamese fighting fish', { b: 'fish', v: 'betta', c: ['#ff5fa8', '#c42f7a', '#ffd9e8'] }],
      ['Chiang Mai', 'Chang', 'Asian elephant', { b: 'stand', v: 'elephant', c: ['#bab4ca', '#7c75a0', '#e6e2f2'] }],
      ['Phuket', 'Chanee', 'White-handed gibbon', { b: 'sit', v: 'monkey', c: ['#e8d9b0', '#8f7a4d', '#fffaf0'], muz: 'monkey', fcol: '#4a4466', ring: 1, arms: 'long', tail: 'none' }],
    ]],
    ['at', 'Austria', 2, [
      ['Vienna', 'Lipi', 'Lipizzaner', { b: 'stand', v: 'horse', c: ['#f4efe4', '#bcc2da', '#fffaf0'], acc: 'bridle' }],
      ['Salzburg', 'Murmeli', 'Alpine marmot', { b: 'sit', c: ['#c98a5a', '#6b3a24', '#f4d9b0'], ears: 'tiny', muz: 'teeth', tail: 'stub', bw: 23, acc: 'edelweiss' }],
      ['Innsbruck', 'Gamsi', 'Chamois', { b: 'stand', c: ['#a8764f', '#3a3466', '#f4e3c8'], horns: 'hook', ears: 'horse', mask: 'chamois' }],
    ]],
    ['sa', 'Saudi Arabia', 2, [
      ['Riyadh', 'Jamal', 'Dromedary', { b: 'stand', v: 'camel', c: ['#e8c290', '#b8905a', '#fff1dc'], ears: 'tiny', acc: 'tassel' }],
      ['AlUla', 'Hudhud', 'Hoopoe', { b: 'bird', v: 'hoopoe', c: ['#ffb07a', '#3a3466', '#fff1dc'], beak: 'long' }],
      ['Jeddah', 'Marjan', 'Clownfish', { b: 'fish', v: 'tall', c: ['#ff9a4d', '#3a3466', '#fffaf0'], pat: 'bands' }],
    ]],
    ['pt', 'Portugal', 2, [
      ['Lisbon', 'Sardi', 'Sardine', { k: 'sardine' }],
      ['Porto', 'Galo', 'Barcelos rooster', { b: 'bird', v: 'rooster', c: ['#5d5780', '#2c2750', '#7a7399'], pat: 'hearts' }],
      ['Algarve', 'Faro', 'Portuguese water dog', { b: 'sit', c: ['#a07c5c', '#5a4030', '#fff1dc'], ears: 'flop', muz: 'dog', coat: 'curly', tail: 'plume' }],
    ]],
    ['my', 'Malaysia', 2, [
      ['Kuala Lumpur', 'Rimau', 'Malayan tiger', { b: 'sit', c: ['#ff9a4d', '#3a3466', '#fffaf0'], ears: 'round', muz: 'cat', pat: 'stripes', tail: 'ringthin' }],
      ['Langkawi', 'Helang', 'Brahminy kite', { b: 'bird', v: 'raptor', c: ['#d9703a', '#8f4a2a', '#fffaf0'], pat: 'whitehead' }],
      ['Borneo', 'Utan', 'Orangutan', { b: 'sit', v: 'monkey', c: ['#e0703a', '#a0482a', '#ffb88a'], muz: 'monkey', fcol: '#f4c9a0', arms: 'long', tail: 'none', hair: 1 }],
    ]],
    ['nl', 'Netherlands', 2, [
      ['Amsterdam', 'Reiger', 'Grey heron', { b: 'wader', c: ['#bcc2da', '#6f698c', '#fffaf0'], beak: 'long', bc: '#ffd84a', lc: '#c9a02a', crest: 1 }],
      ['Keukenhof', 'Lieve', 'Ladybird', { b: 'bug', v: 'ladybug', c: ['#ff5a4d', '#3a3466', '#ffd9cc'], acc: 'tulip' }],
      ['Giethoorn', 'Eendje', 'Mallard', { b: 'bird', v: 'duck', c: ['#d9c9b0', '#8f7a5a', '#fff1dc'], beak: 'duck', pat: 'mallard' }],
    ]],
    ['ca', 'Canada', 2, [
      ['Toronto', 'Bandit', 'Raccoon', { b: 'sit', c: ['#aaa4c2', '#3a3466', '#e6e2f2'], ears: 'round', mask: 'raccoon', tail: 'ring' }],
      ['Vancouver', 'Skaana', 'Orca', { b: 'whale', v: 'orca', c: ['#4a4466', '#2c2750', '#fffaf0'] }],
      ['Banff', 'Wapiti', 'Elk', { b: 'stand', c: ['#c98a5a', '#5a3424', '#f4e3c8'], horns: 'antler', ears: 'deer', mane: 'ruff' }],
    ]],
    ['pl', 'Poland', 2, [
      ['Kraków', 'Smok', 'Wawel dragon', { b: 'lizard', v: 'smok', c: ['#8fd06a', '#4f9a3a', '#e8f6c8'] }],
      ['Warsaw', 'Wiewi', 'Red squirrel', { b: 'sit', c: ['#e0703a', '#a0482a', '#fff1dc'], ears: 'tuft', muz: 'bunny', tail: 'big', acc: 'acorn' }],
      ['Gdańsk', 'Foka', 'Grey seal', { b: 'seal', c: ['#aaa4c2', '#6f698c', '#e6e2f2'], pat: 'blotch', acc: 'amber' }],
    ]],
    ['hr', 'Croatia', 2, [
      ['Dubrovnik', 'Paun', 'Peacock', { b: 'bird', v: 'peacock', c: ['#4f86ff', '#2f5fc9', '#dbe8ff'] }],
      ['Split', 'Pjega', 'Dalmatian', { b: 'sit', c: ['#fffaf0', '#3a3466', '#fffaf0'], ears: 'flop', ec: '#3a3466', muz: 'dog', pat: 'dalmatian', tail: 'thin' }],
      ['Plitvice', 'Vilin', 'Dragonfly', { b: 'bug', v: 'dragonfly', c: ['#54d6a4', '#2e9a74', '#dff7ea'] }],
    ]],
    ['ae', 'United Arab Emirates', 2, [
      ['Dubai', 'Saqr', 'Falcon', { b: 'bird', v: 'raptor', c: ['#c9b8a0', '#6b5a4a', '#fffaf0'], acc: 'hood' }],
      ['Abu Dhabi', 'Arus', 'Dugong', { b: 'seal', v: 'dugong', c: ['#c9b3c9', '#8f7a9a', '#efe4f0'] }],
      ['Sharjah', 'Ramli', 'Sand cat', { b: 'sit', c: ['#ecd09a', '#b8905a', '#fffaf0'], ears: 'big', ic: '#ffc9b0', muz: 'cat', tail: 'ringthin', bw: 19, hw: 1.05 }],
    ]],
    ['ma', 'Morocco', 2, [
      ['Marrakech', 'Belarj', 'White stork', { b: 'wader', c: ['#fffaf0', '#3a3466', '#fffaf0'], beak: 'long', bc: '#ff5a3d', lc: '#ff5a3d', acc: 'fez' }],
      ['Chefchaouen', 'Magot', 'Barbary macaque', { b: 'sit', v: 'monkey', c: ['#d9b48a', '#9c7a5a', '#f4e3c8'], ears: 'side', muz: 'monkey', fcol: '#ffc9b8', tail: 'none' }],
      ['Merzouga', 'Fanak', 'Fennec fox', { b: 'sit', c: ['#ffe0b0', '#d9a066', '#fffaf0'], ears: 'fen', ic: '#ffc2a8', muz: 'long', tail: 'bushy', tt: '#3a3466', bw: 19 }],
    ]],
    ['hu', 'Hungary', 2, [
      ['Budapest', 'Puli', 'Puli', { b: 'sit', v: 'puli', c: ['#fff1d6', '#d6c498', '#fffaf0'] }],
      ['Balaton', 'Fogas', 'Zander', { b: 'fish', v: 'long', c: ['#acd0a4', '#5a7a5a', '#eef6e8'], pat: 'bars', teeth: 1 }],
      ['Hortobágy', 'Mangalica', 'Woolly pig', { b: 'sit', c: ['#f4d9a0', '#c9a06a', '#fff1dc'], ears: 'pig', muz: 'snout', coat: 'curly', tail: 'curl' }],
    ]],
    ['sg', 'Singapore', 2, [
      ['Marina Bay', 'Merang', 'Smooth-coated otter', { b: 'sit', c: ['#b8744d', '#6b3a24', '#f4d9b0'], ears: 'tiny', muz: 'otter', mask: 'face', fcol: '#f4d9b0', tail: 'otter', hw: .95 }],
      ['Sentosa', 'Enggang', 'Oriental pied hornbill', { b: 'bird', v: 'hornbill', c: ['#5d5780', '#2c2750', '#fffaf0'] }],
      ['Sungei Buloh', 'Belacak', 'Mudskipper', { b: 'fish', v: 'mud', c: ['#bdb48c', '#7a704a', '#eee8d0'], pat: 'bluedots' }],
    ]],
    ['kr', 'South Korea', 2, [
      ['Seoul', 'Kkachi', 'Magpie', { b: 'bird', v: 'magpie', c: ['#4a4466', '#2c2750', '#fffaf0'] }],
      ['Busan', 'Galmaegi', 'Black-tailed gull', { b: 'bird', v: 'gull', c: ['#fffaf0', '#aaa4c2', '#fffaf0'], beak: 'gull' }],
      ['Jeju', 'Dwaeji', 'Jeju black pig', { b: 'sit', c: ['#6a6490', '#3a3466', '#8d87a8'], ears: 'pig', muz: 'snout', snc: '#ffb8c8', tail: 'curl', belly: 0 }],
    ]],
    ['eg', 'Egypt', 2, [
      ['Cairo', 'Bastet', 'Egyptian Mau', { b: 'sit', c: ['#e8c290', '#8f6a4d', '#fff1dc'], ears: 'fox', ic: '#ffc2a8', muz: 'cat', pat: 'spots', tail: 'thin', acc: 'collar', bw: 18, hw: .92 }],
      ['Luxor', 'Khepri', 'Scarab', { b: 'bug', v: 'scarab', c: ['#4f86ff', '#2f5fc9', '#dbe8ff'] }],
      ['Aswan', 'Sobek', 'Nile crocodile', { b: 'lizard', v: 'croc', c: ['#a9b06a', '#6a7a3a', '#eef0c8'], acc: 'collar' }],
    ]],
    ['id', 'Indonesia', 2, [
      ['Bali', 'Tokek', 'Tokay gecko', { k: 'gecko' }],
      ['Labuan Bajo', 'Ora', 'Komodo dragon', { b: 'lizard', v: 'komodo', c: ['#aea78f', '#6f6a5a', '#e8e4d4'] }],
      ['Yogyakarta', 'Kukang', 'Slow loris', { b: 'sit', v: 'loris', c: ['#ead3b3', '#8f6a4d', '#fffaf0'], ears: 'tiny', mask: 'loris', er: 7, tail: 'none' }],
    ]],
    ['ch', 'Switzerland', 2, [
      ['Lucerne', 'Chüeli', 'Alpine cow', { b: 'stand', v: 'cow', c: ['#fffaf0', '#b8744d', '#ffd9e0'], horns: 'nub', ears: 'side2', pat: 'cow', acc: 'bell' }],
      ['Zermatt', 'Näsli', 'Valais blacknose sheep', { b: 'sit', v: 'sheep', c: ['#fffaf0', '#3a3466', '#fffaf0'], hc: '#5d5780', ears: 'sheep', ec: '#5d5780', horns: 'curl' }],
      ['Interlaken', 'Barry', 'St. Bernard', { b: 'sit', c: ['#fffaf0', '#c4623e', '#fffaf0'], ears: 'flop', ec: '#c4623e', mask: 'stb', muz: 'dog', tail: 'plume', acc: 'barrel' }],
    ]],
    ['cz', 'Czechia', 2, [
      ['Prague', 'Lev', 'Two-tailed lion', { b: 'sit', c: ['#fffaf0', '#c9cde0', '#fffaf0'], ears: 'round', mane: 1, mc: '#dfe2ee', muz: 'cat', tail: 'twin', acc: 'crown' }],
      ['Český Krumlov', 'Méďa', 'Brown bear', { b: 'sit', c: ['#dba06a', '#8f5a3a', '#f4e3c8'], ears: 'round', muz: 'dog', tail: 'stub', acc: 'rose' }],
      ['Karlovy Vary', 'Jelen', 'Red deer stag', { b: 'stand', c: ['#c9a27a', '#7a5a3f', '#f4e3c8'], horns: 'antler', ears: 'deer' }],
    ]],
    ['al', 'Albania', 3, [['Tirana', 'Shqipe', 'Golden eagle', { b: 'bird', v: 'raptor', c: ['#8f6a4d', '#5a4030', '#d9b89a'], acc: 'redscarf' }]]],
    ['tn', 'Tunisia', 3, [['Sidi Bou Said', 'Maknine', 'Goldfinch', { b: 'bird', v: 'goldfinch', c: ['#e8d0b0', '#3a3466', '#fffaf0'], beak: 'cone' }]]],
    ['in', 'India', 3, [['Jaipur', 'Hathi', 'Painted elephant', { b: 'stand', v: 'elephant', c: ['#aaa4c2', '#6f698c', '#e6e2f2'], pat: 'painted' }]]],
    ['be', 'Belgium', 3, [['Bruges', 'Lanchals', 'Mute swan', { b: 'wader', v: 'swan', c: ['#fffaf0', '#e6dfcf', '#fffaf0'], beak: 'swan', bc: '#ff9a4d' }]]],
    ['za', 'South Africa', 3, [['Cape Town', 'Pikkie', 'African penguin', { b: 'bird', v: 'penguin', c: ['#4a4466', '#2c2750', '#fffaf0'], beak: 'pen', bc: '#2c2750' }]]],
    ['do', 'Dominican Republic', 3, [['Samaná', 'Yubarta', 'Humpback whale', { b: 'whale', v: 'humpback', c: ['#7494d4', '#3d5fa8', '#e6eeff'] }]]],
    ['uz', 'Uzbekistan', 3, [['Samarkand', 'Sher', 'Tile tiger', { b: 'sit', c: ['#ffc46b', '#2f8fa8', '#fff1dc'], ears: 'round', muz: 'cat', pat: 'stripes', tail: 'ringthin' }]]],
    ['tw', 'Taiwan', 3, [['Taipei', 'Chuan', 'Formosan pangolin', { b: 'sit', v: 'pangolin', c: ['#c98a5a', '#8f5a3a', '#f4d9b0'], tail: 'pango' }]]],
    ['au', 'Australia', 3, [['Sydney', 'Gula', 'Koala', { b: 'sit', c: ['#bab4ca', '#7c75a0', '#fffaf0'], ears: 'koala', muz: 'big', acc: 'gumleaf' }]]],
    ['ie', 'Ireland', 3, [['Dublin', 'Fia', 'Fallow deer', { b: 'stand', c: ['#dba06a', '#8f5a3a', '#fff1dc'], horns: 'palm', ears: 'deer', pat: 'spots' }]]],
    ['se', 'Sweden', 3, [['Stockholm', 'Älgis', 'Moose', { b: 'stand', v: 'moose', c: ['#8f6a4d', '#5a4030', '#c9a27a'], horns: 'moose', ears: 'deer' }]]],
    ['kh', 'Cambodia', 3, [['Siem Reap', 'Neak', 'Naga', { b: 'snake', v: 'naga', c: ['#ffd84a', '#c99a2a', '#fff6cc'] }]]],
    ['br', 'Brazil', 3, [['Rio de Janeiro', 'Capivara', 'Capybara', { b: 'sit', v: 'capy', c: ['#c9a27a', '#8f6a4d', '#e8d0b0'], ears: 'tiny', muz: 'capy', tail: 'none', acc: 'orange' }]]],
    ['ar', 'Argentina', 3, [['Buenos Aires', 'Hornero', 'Rufous hornero', { b: 'bird', c: ['#dba06a', '#a0703a', '#fff1dc'] }]]],
    ['co', 'Colombia', 3, [['Cartagena', 'Perezoso', 'Brown-throated sloth', { b: 'sit', v: 'sloth', c: ['#c9b08a', '#6b5a3a', '#f4e8d0'], mask: 'sloth', arms: 'claws', tail: 'none' }]]],
    ['ph', 'Philippines', 3, [['Bohol', 'Mamag', 'Philippine tarsier', { b: 'sit', v: 'tarsier', c: ['#c9a27a', '#8f6a4d', '#f4e3c8'], ears: 'mouse', ic: '#ffc2a8', er: 8.5, eg: 11.5, tail: 'rat', tc: '#c9a27a' }]]],
    ['jo', 'Jordan', 3, [['Petra', 'Wardi', 'Sinai rosefinch', { b: 'bird', c: ['#ff9cc8', '#c94f86', '#ffe0ee'], beak: 'cone' }]]],
    ['cl', 'Chile', 3, [['Torres del Paine', 'Chulengo', 'Guanaco', { b: 'stand', v: 'guanaco', c: ['#dba06a', '#8f5a3a', '#fffaf0'], ears: 'llama' }]]],
    ['qa', 'Qatar', 3, [['Doha', 'Orry', 'Arabian oryx', { b: 'stand', c: ['#fffaf0', '#3a3466', '#fffaf0'], horns: 'straight', hc2: '#3a3466', ears: 'deer', mask: 'oryx' }]]],
    ['ge', 'Georgia', 3, [['Tbilisi', 'Khokhobi', 'Common pheasant', { b: 'bird', v: 'pheasant', c: ['#e0703a', '#8f4a2a', '#ffd0a0'] }]]],
    ['no', 'Norway', 3, [['Tromsø', 'Fjellrev', 'Arctic fox', { b: 'sit', c: ['#fffaf0', '#c9cde0', '#fffaf0'], ears: 'round', muz: 'long', tail: 'bushy', coat: 'fluffy' }]]],
    ['la', 'Laos', 3, [['Luang Prabang', 'Mee', 'Moon bear', { b: 'sit', c: ['#5d5780', '#2c2750', '#7a7399'], ears: 'round', muz: 'dog', pat: 'moon', belly: 0, tail: 'stub' }]]],
    ['om', 'Oman', 3, [['Muscat', 'Nimr', 'Arabian leopard', { b: 'sit', c: ['#f4d9a0', '#8f6a4d', '#fffaf0'], ears: 'round', muz: 'cat', pat: 'rosettes', tail: 'thin' }]]],
    ['nz', 'New Zealand', 3, [['Queenstown', 'Kiwi', 'Kiwi', { b: 'bird', v: 'kiwi', c: ['#b8905a', '#6b5a3a', '#d9b89a'], beak: 'kiwi', bc: '#c9a06a' }]]],
    ['pe', 'Peru', 3, [['Cusco', 'Paco', 'Alpaca', { k: 'alpaca' }]]],
    ['cr', 'Costa Rica', 3, [['La Fortuna', 'Ranita', 'Red-eyed tree frog', { b: 'frog', v: 'tree', c: ['#6fd66a', '#2e9a4a', '#fff6cc'], red: 1 }]]],
    ['ke', 'Kenya', 3, [['Nairobi', 'Twiga', 'Giraffe', { b: 'stand', v: 'giraffe', c: ['#ffd08a', '#c97a3a', '#fff1dc'], horns: 'ossi', ears: 'deer', pat: 'giraffe' }]]],
    ['is', 'Iceland', 3, [['Reykjavík', 'Lundi', 'Atlantic puffin', { k: 'puffin' }]]],
    ['cu', 'Cuba', 3, [['Havana', 'Zunzún', 'Bee hummingbird', { b: 'bird', v: 'humming', c: ['#54d6a4', '#2e9a74', '#dff7ea'], beak: 'needle', bc: '#3a3466' }]]],
    ['tz', 'Tanzania', 3, [['Serengeti', 'Milia', 'Plains zebra', { b: 'stand', v: 'horse', c: ['#fffaf0', '#3a3466', '#fffaf0'], pat: 'zebra', mc: '#3a3466' }]]],
  ];
  const pad = (n, w) => String(n).padStart(w, '0');
  const list = [];
  const places = PL.map(([code, name, tier, cs], i) => {
    const p = { code, name, tier, rank: tier ? i : null, rk: tier ? pad(i, 2) : '', critters: [] };
    cs.forEach(([city, nm, species, spec]) => {
      const n = list.length + 1, id = 'cp-' + pad(n, 3);
      const c = { id, no: n, num: '#' + pad(n, 3), name: nm, species, city, place: name, code, tier, rank: p.rank, spec, kind: spec.k || id };
      list.push(c); p.critters.push(c);
    });
    return p;
  });
  window.CritterDex = { places, list, byId: Object.fromEntries(list.map(c => [c.id, c])) };
})();
