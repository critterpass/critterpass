import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const inFront = (state: string | null | undefined) =>
  state !== 'background' && state !== 'inactive';

/** The app is in front (an unknown state at launch counts as in front). */
export function useInFront(): boolean {
  const [front, setFront] = useState(inFront(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setFront(inFront(state)));
    return () => subscription.remove();
  }, []);
  return front;
}
