/**
 * The widget gallery (5c-5) on this phone: which widgets are already on the home screen, the real
 * days on the countdown preview, and "+", which asks the launcher to pin the widget on Android
 * and otherwise shows how to add it by hand. The list is read again when the app comes back (the
 * launcher's own dialog, or the home screen, is where a widget gets added).
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { addWidget, countdownDays, galleryRows, type GalleryKind } from './gallery-rows';
import { installedWidgetsPayload } from './installed-widgets';
import { sessionSnapshotFetch } from './use-widget-sync';

import { useWidgetCopy } from './widget-copy';
import { installedWidgetPorts, widgetPinPort } from './widget-ports';

/**
 * The gallery's rows, the countdown's days and what "+" does (ask the launcher, or say how); both
 * the current and premium galleries draw it.
 */
export function useWidgetGallery() {
  const copy = useWidgetCopy();
  const [installed, setInstalled] = useState<readonly string[]>([]);
  const [days, setDays] = useState<number | null>(null);
  const [howTo, setHowTo] = useState<GalleryKind | null>(null);

  useEffect(() => {
    let live = true;
    const read = () => {
      void installedWidgetPorts()
        ?.installed?.()
        .then((placed) => {
          if (live) setInstalled(installedWidgetsPayload(placed).widgets.map((w) => w.kind));
        })
        .catch(() => undefined);
    };
    read();
    void sessionSnapshotFetch()().then((answer) => {
      if (live && answer.kind === 'ok') setDays(countdownDays(answer.body, Date.now()));
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);

  return {
    rows: galleryRows(installed),
    countdownDays: days,
    /** The widget whose by-hand steps are open, by its gallery name. */
    howTo: howTo === null ? null : copy[howTo].title,
    closeHowTo: () => setHowTo(null),
    add: (kind: GalleryKind) => {
      if (addWidget(kind, widgetPinPort()) === 'how_to') setHowTo(kind);
    },
  };
}

