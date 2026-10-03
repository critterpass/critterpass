import { LanguageScreen } from '@/features/you/language/language-screen';
import { LocalFirstGate } from '@/features/you/local-first-gate';

/** Settings › Language and currency (3n-8). */
export default function LanguageRoute() {
  return (
    <LocalFirstGate>
      <LanguageScreen />
    </LocalFirstGate>
  );
}
