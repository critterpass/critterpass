/**
 * Place photos beyond Đà Nẵng: names in Japanese, Spanish, Portuguese, Indonesian and Icelandic
 * match the Wikidata item they are and nothing they are only named after, and generic stock
 * follows what a name says it serves in those languages.
 */
import { describe, expect, it } from 'vitest';

import { genericSubjectFor } from '../src/kinds/media/generic';
import { matchPlace, type WikidataPlace } from '../src/kinds/media/place-match';

const item = (id: string, labels: string[], lat: number, lng: number): WikidataPlace => ({
  id,
  labels,
  lat,
  lng,
  file: `File:${id}.jpg`,
});
const place = (name: string, category: string, lat: number, lng: number, ref = 'fsq_os:a1') => ({
  ref,
  destination: 'kyoto',
  name,
  category,
  lat,
  lng,
});

describe('which Wikidata item a place is, in the destinations’ languages', () => {
  it('matches a Japanese name, alone or beside its English one', () => {
    const kodaiji = item('Q2702064', ['Kōdai-ji', '高台寺'], 35.0008, 135.7811);
    expect(matchPlace(place('高台寺', 'temple_shrine', 35.0008, 135.781), [kodaiji])?.label).toBe(
      '高台寺',
    );
    expect(
      matchPlace(place('Kodaiji Temple - 高台寺', 'temple_shrine', 35.0008, 135.781), [kodaiji])
        ?.item.id,
    ).toBe('Q2702064');
    // The garden of a temple is not the temple, and a bus stop by a shrine is not the shrine.
    const ninnaji = item('Q1', ['仁和寺', 'Ninna-ji'], 35.0311, 135.7138);
    expect(matchPlace(place('仁和寺庭園', 'nature', 35.0311, 135.7138), [ninnaji])).toBeNull();
    const shimogamo = item('Q2', ['下鴨神社', 'Shimogamo Shrine'], 35.039, 135.773);
    expect(
      matchPlace(place('下鴨神社前バス停', 'transit', 35.039, 135.773), [shimogamo]),
    ).toBeNull();
  });

  it('reads the type in an Icelandic or Japanese compound', () => {
    const gullfoss = item('Q38519', ['Gullfoss'], 64.3271, -20.1199);
    expect(
      matchPlace(place('Gullfoss Waterfall', 'museum', 64.3275, -20.12), [gullfoss])?.item.id,
    ).toBe('Q38519');
    const nijo = item('Q3', ['二条城', 'Nijō Castle'], 35.0142, 135.7482);
    expect(
      matchPlace(place('二条城 (Nijo-jo Castle)', 'museum', 35.0142, 135.748), [nijo])?.item.id,
    ).toBe('Q3');
  });

  it('keeps a lake from its mountain and a garden from its tower', () => {
    const mount = item('Q43876', ['Gunung Batur', 'Mount Batur'], -8.242, 115.375);
    expect(matchPlace(place('Mount Batur', 'nature', -8.24, 115.376), [mount])?.item.id).toBe(
      'Q43876',
    );
    expect(matchPlace(place('Lake Batur', 'nature', -8.24, 115.376), [mount])).toBeNull();
    const tower = item('Q4', ['Torre de Belém', 'Belém Tower'], 38.6916, -9.216);
    expect(matchPlace(place('Belem Tower', 'museum', 38.6916, -9.2159), [tower])?.item.id).toBe(
      'Q4',
    );
    expect(
      matchPlace(place('Jardim da Torre de Belém', 'nature', 38.692, -9.215), [tower]),
    ).toBeNull();
  });

  it('matches a Spanish "templo" to the church it is, not to the convent next door', () => {
    const church = item('Q5', ['Iglesia de San Pedro', 'Church of San Pedro'], -13.5216, -71.9817);
    expect(
      matchPlace(place('Templo De San Pedro', 'temple_shrine', -13.5215, -71.9816), [church])?.item
        .id,
    ).toBe('Q5');
    const convent = item('Q6', ['Convento do Carmo'], 38.712, -9.1403);
    expect(
      matchPlace(place('Igreja do Carmo', 'temple_shrine', 38.712, -9.1405), [convent]),
    ).toBeNull();
  });

  it('never gives a place the venue named after it', () => {
    const museum = item(
      'Q7',
      ['Museo Machu Picchu', 'Museo Machupicchu - Casa Concha'],
      -13.5158,
      -71.9773,
    );
    expect(
      matchPlace(place('Machu Picchu, Peru - Wonder Of The World', 'museum', -13.516, -71.977), [
        museum,
      ]),
    ).toBeNull();
    expect(
      matchPlace(place('Museo MachuPicchu Casa Concha', 'museum', -13.5158, -71.9773), [museum])
        ?.item.id,
    ).toBe('Q7');
    const hotel = item('Q8', ['Sheraton Centro Histórico'], 19.4353, -99.1455);
    expect(
      matchPlace(place('Centro Histórico CDMX', 'museum', 19.4336, -99.1412), [hotel]),
    ).toBeNull();
  });

  it('never gives a temple the beach or the hill it is named after', () => {
    const beach = item('Q10796763', ['Bãi Tắm Mỹ Khê', 'Mỹ Khê', 'My Khe Beach'], 16.06, 108.247);
    expect(matchPlace(place('Đình Mỹ Khê', 'temple_shrine', 16.063, 108.245), [beach])).toBeNull();
    expect(matchPlace(place('My Khe Beach', 'beach', 16.063, 108.245), [beach])?.item.id).toBe(
      'Q10796763',
    );
  });

  it('takes where a place is, after a comma, for no name of it', () => {
    const sintra = item(
      'Q532399',
      ['Palácio Nacional de Sintra', 'Istana Sintra'],
      38.7976,
      -9.3906,
    );
    expect(
      matchPlace(place('Penha Palace, Sintra, Portugal', 'nature', 38.7975, -9.39), [sintra]),
    ).toBeNull();
  });

  it('prefers the closer name between two equally good items', () => {
    const gallery = item('Q3480309', ['National Gallery of Iceland'], 64.1441, -21.9393);
    const museum = item('Q626963', ['National Museum of Iceland'], 64.1417, -21.9486);
    const poi = place('Iceland National Museum', 'museum', 64.1436, -21.941);
    expect(matchPlace(poi, [gallery, museum])?.item.id).toBe('Q626963');
    expect(matchPlace(poi, [museum, gallery])?.item.id).toBe('Q626963');
  });
});

describe('generic stock in the destinations’ languages', () => {
  const at = (name: string, category: string, destination: string) =>
    genericSubjectFor({ name, category, destination });

  it('shows the local thing only where it is local', () => {
    expect(at('Cộng Cà Phê', 'food', 'da-nang')?.query).toBe('vietnamese coffee phin');
    expect(at('Café Loki', 'food', 'iceland')?.key).toBe('coffee-cup');
    expect(at('前田珈琲明倫店', 'food', 'kyoto')?.key).toBe('coffee-cup');
    expect(at('Praia do Guincho, Cascais', 'beach', 'lisbon')?.query).toBe('sandy beach waves');
  });

  it('reads what a name says it serves', () => {
    expect(at('ラーメン二郎 京都店', 'food', 'kyoto')?.key).toBe('ramen');
    expect(at('一保堂茶舗', 'food', 'kyoto')?.key).toBe('matcha');
    expect(at('Taquería La Loma', 'food', 'mexico-city')?.key).toBe('tacos');
    expect(at('Cervecería Willkamayu', 'nightlife', 'cusco')?.key).toBe('craft-beer');
    expect(at('Babi Guling Pak Dodot', 'food', 'bali')?.key).toBe('babi-guling');
    expect(at('Solar Do Bacalhau', 'food', 'lisbon')?.key).toBe('seafood');
    expect(at('Apotek Restaurant', 'food', 'iceland')?.key).toBe('restaurant');
  });

  it('offers nothing to a name that says nothing, a club that is no nightclub, or a landmark', () => {
    expect(at('Pujol', 'food', 'mexico-city')).toBeNull();
    expect(at('Belcanto', 'food', 'lisbon')).toBeNull();
    expect(at('Clube de Jornalistas', 'food', 'lisbon')).toBeNull();
    expect(at('Peruvian Whistling Bottles Vitancio', 'other', 'cusco')).toBeNull();
    expect(at('Museo del Templo Mayor', 'museum', 'mexico-city')).toBeNull();
    expect(at('Farmácia Barreto', 'health', 'lisbon')).toBeNull();
  });
});
