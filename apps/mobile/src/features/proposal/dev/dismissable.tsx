/** A lab sheet scene that really closes, so back on the scene closes the sheet first. */
import { useState, type ReactNode } from 'react';

export function Dismissable({ children }: { readonly children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(true);
  return open ? children(() => setOpen(false)) : null;
}
