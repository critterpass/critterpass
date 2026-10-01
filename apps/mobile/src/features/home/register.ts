/** Home's start-up registrations: the guide the shell shows is the current trip's. */
import { provideActiveGuide } from '@/lib/navigation/active-guide';

import { useCurrentTripGuide } from './data/use-trip-guide';

provideActiveGuide(useCurrentTripGuide);
