/** The 3a-1 splash's styles: the passport cover, its globe and sheen, Tokek on top, the footer. */
import { makeStyles } from '@/ui/theme';

import { COVER_H, COVER_W } from './passport-opening';

export const useSplashStyles = makeStyles((th) => ({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: {
    width: COVER_W,
    height: COVER_H,
    borderRadius: 18,
    backgroundColor: th.color.orange,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 36,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: th.color.yellow,
  },
  globe: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: th.color.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeLat: { position: 'absolute', width: 96, height: 4, backgroundColor: th.color.yellow },
  globeLng: {
    width: 44,
    height: 88,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: th.color.yellow,
  },
  sheen: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 60,
    backgroundColor: th.color.paper.base,
  },
  tokek: { position: 'absolute', top: -58, alignSelf: 'center' },
  page: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: th.color.paper.base,
  },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['12'],
    alignItems: 'center',
  },
  devTools: { marginTop: th.space['4'] },
}));
