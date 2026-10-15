/**
 * Whether the drawn tab bar shows over the focused tab's pages (Android), for the pages under it
 * to fade into their ground there. Read from the tab bar's own rule (`lib/navigation/tab-bar.ts`)
 * rather than a page's place in its stack: the Wallet's Bookings half sits second in the tab's
 * stack yet is a root page with the bar over it. Undefined outside the tabs.
 */
import { createContext } from 'react';

export const TabBarShownContext = createContext<boolean | undefined>(undefined);
