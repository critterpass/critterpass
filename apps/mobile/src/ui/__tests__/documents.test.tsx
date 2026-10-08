// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { fireEvent, screen, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { GiftCard, formatGiftCode } from '../documents/GiftCard';
import { mrzLine, toMrz } from '../documents/mrz';
import { PassportPage } from '../documents/PassportPage';
import { Receipt, zigzagPath } from '../documents/Receipt';
import { appendPoint, SignatureLayer } from '../documents/SignatureLayer';
import { Stamp, stampLineInset, stampLineMaxSize } from '../documents/Stamp';
import { Ticket } from '../documents/Ticket';
import { Visa } from '../documents/Visa';
import { fixturesFor, listComponents } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { renderUi } from '../test-support/render';

import '../documents/documents.fixtures';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

const LOCALES = ['en', 'vi', 'ja'] as const;

function Passport({ name, home }: { readonly name: string; readonly home: string }) {
  return (
    <PassportPage
      headStart="Critterpass · Passeport"
      headEnd="CP-0427"
      photo={<Icon name="camera" size={40} decorative />}
      fields={[
        { key: 'n', label: 'Given name · Prénom', value: name },
        { key: 'h', label: 'Home', value: home },
      ]}
      stamps={<Stamp title="SIN" top="Home" ink={tokens.color.orange} slam />}
      mrz={[mrzLine(['P', 'SGP', name])]}
      accessibilityLabel={`Passport of ${name}, home ${home}`}
    />
  );
}

describe('document artefacts', () => {
  it('transliterates machine-readable lines to the ICAO alphabet', () => {
    expect(toMrz('Nguyễn Văn Đức')).toBe('NGUYEN<VAN<DUC');
    expect(toMrz('Straße')).toBe('STRASSE');
    expect(mrzLine(['P', 'SGP', 'Winston'], 20)).toBe('P<<SGP<<WINSTON<<<<<');
    expect(mrzLine(['CP0427', 'A'.repeat(50)], 10)).toHaveLength(10);
  });

  it.each(LOCALES)(
    'reads a passport page as one element with the MRZ hidden (%s)',
    async (locale) => {
      const name = locale === 'ja' ? '佐藤 凛' : locale === 'vi' ? 'Nguyễn Văn An' : 'Winston';
      await renderUi(
        <ScreenJoltProvider>
          <Passport name={name} home="Singapore" />
        </ScreenJoltProvider>,
        { locale },
      );
      const page = screen.getByLabelText(`Passport of ${name}, home Singapore`);
      expect(page.props.accessible).toBe(true);
      expect(screen.queryByText(mrzLine(['P', 'SGP', name]))).toBeNull();
      expect(
        screen.getByText(mrzLine(['P', 'SGP', name]), { includeHiddenElements: true }),
      ).toBeTruthy();
    },
  );

  it('keeps the ticket sticker beside the fields, in flow, so it never covers a value', async () => {
    await renderUi(
      <Ticket
        testID="ticket"
        headStart="Critterpass Air"
        from={{ code: 'SIN' }}
        to={{ code: 'KIX' }}
        fields={[
          { key: 'p', label: 'Passenger', value: 'Rin Sato' },
          { key: 's', label: 'Seat', value: 'Window, by Maya' },
        ]}
        sticker={<View testID="raccoon" />}
        stubText="Boarding group"
        accessibilityLabel="Boarding pass, SIN to KIX"
      />,
    );
    const slot = screen.getByTestId('ticket-sticker', { includeHiddenElements: true });
    const flat = (node: { props: { style?: unknown } } | null) =>
      StyleSheet.flatten(node?.props.style as StyleProp<ViewStyle>) ?? {};
    expect(flat(slot).position).toBeUndefined();
    const row = slot.parent;
    expect(flat(row).flexDirection).toBe('row');
    const value = within(row as never).getByText('WINDOW, BY MAYA', {
      includeHiddenElements: true,
    });
    // Beside the sticker a long value wraps rather than being cut.
    expect(value.props.numberOfLines).toBeUndefined();
  });

  it('groups tickets, visas, receipts and gift cards under one label each', async () => {
    await renderUi(
      <View>
        <Ticket
          headStart="Critterpass Air"
          from={{ code: 'SIN' }}
          to={{ code: 'KIX' }}
          fields={[{ key: 'p', label: 'Passenger', value: 'Rin' }]}
          stubText="Boarding group"
          accessibilityLabel="Boarding pass, SIN to KIX"
        />
        <Visa
          kind="boost"
          eyebrow="Entry"
          title="Trip boost"
          perk="Redrafts"
          accessibilityLabel="Trip boost stamp"
        />
        <Receipt
          title="The Bali Six"
          sections={[
            [{ key: 't', label: 'Total', amount: '$6,980', emphasis: true, highlight: true }],
          ]}
          accessibilityLabel="Receipt, total $6,980"
        />
        <GiftCard
          title="Pass+"
          from="From Maya"
          code="ab12cd34ef56"
          accessibilityLabel="Gift card from Maya"
        />
      </View>,
    );
    for (const label of [
      'Boarding pass, SIN to KIX',
      'Trip boost stamp',
      'Receipt, total $6,980',
      'Gift card from Maya',
    ]) {
      expect(screen.getByRole('summary', { name: label })).toBeTruthy();
    }
    expect(formatGiftCode('ab12cd34ef56')).toBe('AB12-CD34-EF56');
    expect(zigzagPath(40, 10).match(/L/g)).toHaveLength(8);
  });

  it('labels stamps from their words and marks pending ones', async () => {
    await renderUi(
      <View>
        <Stamp title="Paid" top="Balances" bottom="In full" ink={tokens.color.green.deep} />
        <Stamp shape="pending" title="?" top="Next" ink={tokens.color.ink[300]} testID="pending" />
      </View>,
    );
    expect(screen.getByRole('image', { name: 'Balances Paid In full' })).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain('"borderStyle":"dashed"');
  });

  it('fits every stamp word on one line inside the ring instead of breaking it', async () => {
    await renderUi(
      <Stamp
        title="Issued"
        top="CRITTERPASS"
        bottom="SEP 28, 2026"
        ink={tokens.color.pink}
        size={92}
        testID="issued"
      />,
    );
    for (const word of ['ISSUED', 'CRITTERPASS', 'SEP 28, 2026']) {
      const text = screen.getByText(word);
      expect(text.props.numberOfLines).toBe(1);
      expect(text.props.adjustsFontSizeToFit).toBe(true);
    }
    expect(stampLineInset(76, true)).toBe(8);
    expect(stampLineInset(131, false)).toBe(4);
  });

  it('sets a small round stamp’s lines smaller, and leaves stamps of 85 pt and up alone', () => {
    expect(stampLineMaxSize(72, 11)).toBe(9.4);
    expect(stampLineMaxSize(56, 11)).toBe(7.3);
    for (const size of [85, 92, 96, 150]) expect(stampLineMaxSize(size, 11)).toBe(11);
  });

  it('lets anyone sign by typing their name, and builds drawn paths', async () => {
    expect(appendPoint('', 1.234, 5, true)).toBe('M1.2 5');
    expect(appendPoint('M1 1', 2, 3, false)).toBe('M1 1L2 3');
    const onChange = jest.fn();
    const { rerender } = await renderUi(
      <SignatureLayer name="Winston Tan" value={null} onChange={onChange} />,
    );
    const pad = screen.getByRole('adjustable', { name: 'Signature pad' });
    expect(pad.props.accessibilityValue).toEqual({ text: 'Not signed' });
    await activate(pad);
    expect(onChange).toHaveBeenCalledWith({ kind: 'typed', name: 'Winston Tan' });
    await rerender(
      <SignatureLayer
        name="Winston Tan"
        value={{ kind: 'typed', name: 'Winston Tan' }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Winston Tan', { includeHiddenElements: true })).toBeTruthy();
    await activate(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('gallery fixtures', () => {
  const families = [
    'PassportPage',
    'PassportCover',
    'PaperChrome',
    'Stamp',
    'Ticket',
    'Receipt',
    'GiftCard',
    'SignatureLayer',
  ];

  it.each(LOCALES)('renders every sticker-free document fixture in %s', async (locale) => {
    expect(listComponents()).toEqual(expect.arrayContaining(families));
    // Fixtures showing a guide sticker need the native Skia renderer; the on-device gallery covers them.
    const withSticker = new Set(['PassportPage', 'PassportCover']);
    for (const component of families.filter((name) => !withSticker.has(name))) {
      for (const fixture of fixturesFor(component)) {
        if (component === 'Ticket' && fixture.state.startsWith('crew')) continue;
        const { unmount } = await renderUi(
          <ScreenJoltProvider>{fixture.render()}</ScreenJoltProvider>,
          {
            locale,
          },
        );
        await unmount();
      }
    }
  });
});
