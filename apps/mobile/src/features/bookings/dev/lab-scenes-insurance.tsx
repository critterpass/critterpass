/** Bookings lab scenes for the insurance card on the wallet and the policy form. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Scaffold } from '@/ui/surface/Scaffold';

import { InsuranceCard } from '../insurance/InsuranceCard';
import { InsuranceFormView } from '../insurance/InsuranceFormView';
import { LAB_POLICY } from './lab-fixtures';

const noop = () => undefined;

export const INSURANCE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'insurance-card': () => (
    <Scaffold variant="dark">
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, gap: 20 }}>
        <InsuranceCard policy={LAB_POLICY} onOpen={noop} onCall={noop} />
        <InsuranceCard policy={null} onOpen={noop} onCall={noop} />
      </ScrollView>
    </Scaffold>
  ),
  'insurance-form': () => (
    <InsuranceFormView
      draft={{ provider: 'Chubb Travel', policyNo: 'CHB-2231-889', phone: '+65 6812 3456' }}
      doc="attached"
      canScan
      saving={false}
      error={null}
      canDelete
      onChange={noop}
      onScan={noop}
      onSave={noop}
      onDelete={noop}
    />
  ),
  'insurance-form-offline': () => (
    <InsuranceFormView
      draft={{ provider: 'Chubb Travel', policyNo: '', phone: '' }}
      doc="none"
      canScan
      saving={false}
      error="offline"
      canDelete={false}
      onChange={noop}
      onScan={noop}
      onSave={noop}
      onDelete={noop}
    />
  ),
};
