/** Add to plan's premium look (4.39): the same sheet logic, drawn with the premium pieces. */
import type { AddSheetLook } from '../../add/add-look';
import { PremiumAddBlock, PremiumWhoGoing } from './add-parts';
import { PremiumAddSheetView } from './add-sheet-view';

export const PREMIUM_ADD_LOOK: AddSheetLook = {
  View: PremiumAddSheetView,
  Block: PremiumAddBlock,
  Who: PremiumWhoGoing,
};
