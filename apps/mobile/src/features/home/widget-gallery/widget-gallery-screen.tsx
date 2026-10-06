/**
 * The widget gallery (5c-5) on this phone: which widgets are already on the home screen, the real
 * days on the countdown preview, and "+", which asks the launcher to pin the widget on Android
 * and otherwise shows how to add it by hand. The list is read again when the app comes back (the
 * launcher's own dialog, or the home screen, is where a widget gets added).
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { addWidget, countdownDays, galleryRows, type GalleryKind } from './gallery-rows';
import { installedWidgetsPayload } from './installed-widgets';
import { sessionSnapshotFetch } from './use-widget-sync';
import { WidgetGalleryView } from './widget-gallery-view';
import { WidgetHowToSheet } from './widget-how-to-sheet';
import { installedWidgetPorts, widgetPinPort } from './widget-ports';

export interface WidgetGalleryScreenProps {
  readonly onBack: () => void;
}

export function WidgetGalleryScreen({ onBack }: WidgetGalleryScreenProps) {
  const { t } = useLingui();
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

  const names: Record<GalleryKind, string> = {
    countdown: t({ id: 'home.widgets.countdown', message: 'Countdown' }),
    vote: t({ id: 'home.widgets.vote', message: 'The vote' }),
    today: t({ id: 'home.widgets.today', message: 'Today' }),
    balances: t({ id: 'home.widgets.balances', message: 'Balances' }),
    crew: t({ id: 'home.widgets.crew', message: 'Crew, live' }),
    next_flight: t({ id: 'home.widgets.nextFlight', message: 'Next flight' }),
    critterdex: t({ id: 'home.widgets.critterdex', message: 'Critterdex' }),
  };

  return (
    <>
      <WidgetGalleryView
        rows={galleryRows(installed)}
        countdownDays={days}
        onAdd={(kind) => {
          if (addWidget(kind, widgetPinPort()) === 'how_to') setHowTo(kind);
        }}
        onBack={onBack}
      />
      {howTo === null ? null : (
        <WidgetHowToSheet widget={names[howTo]} onClose={() => setHowTo(null)} />
      )}
    </>
  );
}
