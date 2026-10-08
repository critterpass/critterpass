import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { BillingToggle } from '../monetize/BillingToggle';
import { ComparisonTable } from '../monetize/ComparisonTable';
import { PlanRadioRows } from '../monetize/PlanRadioRows';
import { setUiQaSink } from '../qa/ui-qa';
import { renderUi } from '../test-support/render';

const run = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });

describe('monetisation', () => {
  it('moves the comparison highlight and reads each row across plans', async () => {
    const onHighlight = jest.fn();
    await renderUi(
      <ComparisonTable
        highlighted="pass"
        onHighlight={onHighlight}
        columns={[
          { id: 'free', label: 'Free' },
          { id: 'pass', label: 'Pass+' },
        ]}
        rows={[{ label: 'Crew size', values: ['6', '16'] }]}
      />,
    );
    expect(screen.getByLabelText('Crew size, Free 6, Pass+ 16')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Pass+' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await run(screen.getByRole('tab', { name: 'Free' }), 'activate');
    expect(onHighlight).toHaveBeenCalledWith('free');
  });

  it('lets a table value take a second line without a UI QA report', async () => {
    const reports: string[] = [];
    setUiQaSink((line) => reports.push(line));
    try {
      await renderUi(
        <ComparisonTable
          highlighted="boost"
          columns={[{ id: 'boost', label: 'Boost' }]}
          rows={[{ label: 'Guide chat', values: ['∞ on trip'] }]}
        />,
      );
      const value = screen.getByText('∞ ON TRIP', { includeHiddenElements: true });
      await fireEvent(value, 'textLayout', {
        nativeEvent: { lines: [{ text: '∞ ON ' }, { text: 'TRIP' }] },
      });
      expect(reports).toEqual([]);
    } finally {
      setUiQaSink(null);
    }
  });

  it('picks plans and billing periods as radios with their store prices', async () => {
    const onPlan = jest.fn();
    const onBilling = jest.fn();
    await renderUi(
      <>
        <PlanRadioRows
          label="Boost"
          value="trip"
          onChange={onPlan}
          options={[
            { id: 'trip', title: 'This trip', price: '12,00 €' },
            { id: 'year', title: 'All year', price: '59,00 €' },
          ]}
        />
        <BillingToggle
          value="yearly"
          onChange={onBilling}
          options={[
            { value: 'monthly', label: 'Monthly', price: '3,99 €' },
            { value: 'yearly', label: 'Yearly', price: '29,99 €', badge: '−37%' },
          ]}
        />
      </>,
    );
    expect(
      screen.getByRole('radio', { name: 'This trip, 12,00 €' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await run(screen.getByRole('radio', { name: 'All year, 59,00 €' }), 'activate');
    expect(onPlan).toHaveBeenCalledWith('year');
    expect(
      screen.getByRole('radio', { name: 'Yearly, 29,99 €, −37%' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await run(screen.getByRole('radio', { name: 'Monthly, 3,99 €' }), 'activate');
    expect(onBilling).toHaveBeenCalledWith('monthly');
  });
});

describe('recap and monetisation boundaries', () => {
  it('keeps prices and data out of the components', () => {
    for (const dir of ['recap', 'monetize']) {
      const root = join(__dirname, '..', dir);
      for (const file of readdirSync(root).filter((name) => !name.includes('.fixtures.'))) {
        const source = readFileSync(join(root, file), 'utf8');
        const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(code).not.toMatch(/from '@\/features|from '@cp\/(db|sync|api)/);
        expect(code).not.toMatch(/['"`][$€£¥]\s?\d/);
      }
    }
  });
});
