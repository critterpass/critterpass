/**
 * Add a driver's state, shared by both looks: what the traveller pasted or typed, reading it into a
 * card (a picked screenshot is read on the phone, only its text is shared), and the crew's shared
 * items with where each stands. A read that comes back opens the card to check.
 */
import * as Clipboard from 'expo-clipboard';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';

import { driversRoute } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';
import { contactCard, useIntake } from './use-intake';

/** The phone's text reader (the `cp-ocr` module, passed in by the route); null without one. */
export interface TextReader {
  recognize(uri: string): Promise<{ readonly lines: readonly { readonly text: string }[] }>;
}

export type AddMode = 'paste' | 'contact';

export interface AddDriverInput {
  readonly tripId: string;
  readonly days?: string;
  readonly ocr: TextReader | null;
}

export function useAddDriver({ tripId, days, ocr }: AddDriverInput) {
  const plan = useDriverDays(tripId);
  const { state: drivers, refresh } = useDrivers(tripId);
  const intake = useIntake(tripId);
  const [mode, setMode] = useState<AddMode>('paste');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const reading = intake.state.kind === 'reading';
  const openCheck = (intakeId: string) =>
    router.push(driversRoute(tripId, 'check', { intake: intakeId, ...(days ? { days } : {}) }));
  const read = async (
    kind: 'text' | 'image' | 'contact',
    body: string,
    preset?: ReturnType<typeof contactCard>,
  ) => {
    const item = await intake.submit(kind, body, preset);
    void refresh();
    if (item !== null) openCheck(item.intakeId);
  };
  const paste = () => {
    setMode('paste');
    void Clipboard.getStringAsync().then((clip) => {
      if (clip.trim() !== '') setText(clip);
    });
  };
  const screenshot = async () => {
    const picked = await launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    const uri = picked.canceled ? null : (picked.assets[0]?.uri ?? null);
    if (uri === null) return;
    const result = ocr === null ? null : await ocr.recognize(uri).catch(() => null);
    const lines = result?.lines.map((line) => line.text).join('\n') ?? '';
    if (lines.trim() === '') {
      router.push(driversRoute(tripId, 'check', { unread: '1', ...(days ? { days } : {}) }));
      return;
    }
    await read('image', lines);
  };
  const items =
    drivers.kind === 'ready' || drivers.kind === 'offline' ? (drivers.data?.intake ?? []) : [];
  return {
    plan,
    intake,
    mode,
    setMode,
    text,
    setText,
    name,
    setName,
    phone,
    setPhone,
    reading,
    items,
    openCheck,
    paste,
    screenshot: () => void screenshot(),
    canRead: text.trim().length >= 8 && !reading,
    readText: () => void read('text', text),
    canAddContact: name.trim() !== '' && !reading,
    addContact: () => void read('contact', `${name}\n${phone}`, contactCard(name, phone)),
  };
}
