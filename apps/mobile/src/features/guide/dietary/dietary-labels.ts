/** Words for the dietary form's choices; the stored values stay the wire's own keys. */
/* eslint-disable lingui/no-unlocalized-strings -- stored allergen keys, never copy. */
import { useLingui } from '@lingui/react/macro';

import type { DIETS, SPICE_LEVELS } from '@cp/domain';

export const COMMON_ALLERGENS = [
  'peanuts',
  'tree_nuts',
  'shellfish',
  'fish',
  'dairy',
  'eggs',
  'gluten',
  'soy',
  'sesame',
] as const;
export type Allergen = (typeof COMMON_ALLERGENS)[number];

export function useDietLabels() {
  const { t } = useLingui();
  const diet: Record<(typeof DIETS)[number], string> = {
    none: t({ id: 'guide.dietary.dietNone', message: 'No restrictions' }),
    vegetarian: t({ id: 'guide.dietary.dietVegetarian', message: 'Vegetarian' }),
    vegan: t({ id: 'guide.dietary.dietVegan', message: 'Vegan' }),
    pescatarian: t({ id: 'guide.dietary.dietPescatarian', message: 'Pescatarian' }),
    halal: t({ id: 'guide.dietary.dietHalal', message: 'Halal' }),
    kosher: t({ id: 'guide.dietary.dietKosher', message: 'Kosher' }),
  };
  const spice: Record<(typeof SPICE_LEVELS)[number], string> = {
    none: t({ id: 'guide.dietary.spiceNone', message: 'None' }),
    mild: t({ id: 'guide.dietary.spiceMild', message: 'Mild' }),
    medium: t({ id: 'guide.dietary.spiceMedium', message: 'Medium' }),
    hot: t({ id: 'guide.dietary.spiceHot', message: 'Hot' }),
  };
  const allergens: Record<Allergen, string> = {
    peanuts: t({ id: 'guide.dietary.peanuts', message: 'Peanuts' }),
    tree_nuts: t({ id: 'guide.dietary.treeNuts', message: 'Tree nuts' }),
    shellfish: t({ id: 'guide.dietary.shellfish', message: 'Shellfish' }),
    fish: t({ id: 'guide.dietary.fish', message: 'Fish' }),
    dairy: t({ id: 'guide.dietary.dairy', message: 'Dairy' }),
    eggs: t({ id: 'guide.dietary.eggs', message: 'Eggs' }),
    gluten: t({ id: 'guide.dietary.gluten', message: 'Gluten' }),
    soy: t({ id: 'guide.dietary.soy', message: 'Soy' }),
    sesame: t({ id: 'guide.dietary.sesame', message: 'Sesame' }),
  };
  return {
    diet,
    spice,
    /** A common allergen's name, or what the person typed for their own. */
    allergen: (value: string) => allergens[value as Allergen] ?? value,
  };
}
