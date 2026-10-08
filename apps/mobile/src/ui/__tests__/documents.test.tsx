import { fireEvent, screen, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { mrzLine, toMrz } from '../documents/mrz';
import { zigzagPath } from '../documents/Receipt';
import { appendPoint, SignatureLayer } from '../documents/SignatureLayer';
import { Stamp, stampLineInset, stampLineMaxSize } from '../documents/Stamp';
import { Ticket } from '../documents/Ticket';
import { renderUi } from '../test-support/render';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

describe('document artefacts', () => {
  it('transliterates machine-readable lines to the ICAO alphabet', () => {
    expect(toMrz('Nguyễn Văn Đức')).toBe('NGUYEN<VAN<DUC');
    expect(toMrz('Straße')).toBe('STRASSE');
    expect(mrzLine(['P', 'SGP', 'Winston'], 20)).toBe('P<<SGP<<WINSTON<<<<<');
    expect(mrzLine(['CP0427', 'A'.repeat(50)], 10)).toHaveLength(10);
  });

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

  it('draws a 40 pt receipt edge as eight segments of 10 pt teeth', () => {
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
