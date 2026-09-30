/** The search terms the facilities brief researches each guide destination with. */
export const CITY: Readonly<Record<string, string>> = {
  bali: 'Bali Denpasar Kuta Ubud',
  kyoto: 'Kyoto',
  iceland: 'Reykjavik Iceland',
  'mexico-city': 'Mexico City',
  lisbon: 'Lisbon',
  cusco: 'Cusco Peru',
  'da-nang': 'Da Nang Vietnam',
};

/** Local-language searches that find hospitals and pharmacies English queries miss. */
export const LOCAL_QUERIES: Readonly<Record<string, readonly string[]>> = {
  bali: ['rumah sakit IGD 24 jam Denpasar Bali', 'apotek 24 jam Denpasar Kuta'],
  kyoto: ['京都市 救急病院 夜間', '京都市 薬局 営業時間'],
  iceland: ['Landspítali bráðamóttaka Fossvogi', 'apótek Reykjavík opið'],
  'mexico-city': [
    'hospital urgencias 24 horas Ciudad de México',
    'farmacia 24 horas Ciudad de México',
  ],
  lisbon: ['Hospital de Santa Maria Lisboa urgência contactos', 'farmácia de serviço Lisboa'],
  cusco: ['clínica emergencias 24 horas Cusco', 'farmacia Cusco centro histórico'],
  'da-nang': [
    'Bệnh viện Đa khoa Quốc tế Vinmec Đà Nẵng cấp cứu địa chỉ điện thoại',
    'Bệnh viện Gia Đình Family Hospital Đà Nẵng cấp cứu 24/7 địa chỉ',
    'Bệnh viện C Đà Nẵng địa chỉ số điện thoại cấp cứu',
    'nhà thuốc mở cửa 24h Đà Nẵng địa chỉ',
  ],
};
