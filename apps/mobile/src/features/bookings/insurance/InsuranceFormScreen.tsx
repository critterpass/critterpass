/**
 * Adding or changing the member's policy: the scan reads the page on the phone (empty fields fill
 * from what it read) and uploads it as the policy document; saving goes online, then the phone's
 * own copy is refreshed. Deleting may wait in the offline queue and drops the phone's copy at once.
 */
import { generateUuidV7 } from '@cp/domain';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { deleteInsuranceCommand, saveInsuranceCommand } from '../data/commands';
import { useBookingsServices } from '../data/services';
import { useWalletContext } from '../data/use-wallet-context';
import {
  assistancePhoneFrom,
  forgetInsurance,
  pickPolicy,
  policyNumberFrom,
  refreshInsurance,
  useInsurancePolicies,
} from './insurance-data';
import { InsuranceFormView, type DocState, type InsuranceDraft } from './InsuranceFormView';

export function InsuranceFormScreen() {
  const { db } = useLocalFirst();
  const services = useBookingsServices();
  const context = useWalletContext();
  const { policies } = useInsurancePolicies();
  const save = useCommand(saveInsuranceCommand);
  const del = useCommand(deleteInsuranceCommand);
  const existing = pickPolicy(policies, context.trip?.id ?? null);
  const [draft, setDraft] = useState<InsuranceDraft | null>(null);
  const [doc, setDoc] = useState<DocState>('none');
  const [docKey, setDocKey] = useState<string | null>(null);
  const [error, setError] = useState<'offline' | 'failed' | null>(null);
  const current: InsuranceDraft = draft ?? {
    provider: existing?.provider ?? '',
    policyNo: existing?.policy_no ?? '',
    phone: existing?.assistance_phone ?? '',
  };
  const ocr = services.ocr;

  const scan = async () => {
    if (ocr === null) return;
    setDoc('scanning');
    const captured = await ocr.scanDocument({ pageLimit: 1 }).catch(() => null);
    const uri = captured?.status === 'captured' ? captured.uris[0] : undefined;
    if (uri === undefined) {
      setDoc(docKey === null ? 'none' : 'attached');
      return;
    }
    const read = await ocr.recognize(uri).catch(() => null);
    const lines = read?.lines.map((line) => line.text) ?? [];
    setDraft({
      ...current,
      policyNo: current.policyNo || (policyNumberFrom(lines) ?? ''),
      phone: current.phone || (assistancePhoneFrom(lines) ?? ''),
    });
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a content type, not copy
    const upload = await services.uploadDoc(uri, 'image/jpeg');
    if (upload.kind === 'ok') {
      setDocKey(upload.value);
      setDoc('attached');
    } else {
      setDoc('failed');
    }
  };

  const submit = async () => {
    setError(null);
    const tripId = context.trip?.id;
    const docMediaKey = docKey ?? existing?.doc_media_key ?? undefined;
    const result = await save.send({
      policy_id: existing?.policy_id ?? generateUuidV7(),
      ...(tripId === undefined ? {} : { trip_id: tripId }),
      provider: current.provider.trim(),
      policy_no: current.policyNo.trim(),
      ...(current.phone.trim() === '' ? {} : { assistance_phone: current.phone.trim() }),
      ...(docMediaKey === undefined ? {} : { doc_media_key: docMediaKey }),
    });
    if (result.kind === 'unavailable') {
      setError('offline');
      return;
    }
    if (result.kind === 'rejected') {
      setError('failed');
      return;
    }
    await refreshInsurance(db, services).catch(() => undefined);
    router.back();
  };

  const remove = async () => {
    if (existing === null) return;
    await del.send({ policy_id: existing.policy_id });
    await forgetInsurance(db, existing.policy_id);
    router.back();
  };

  return (
    <InsuranceFormView
      draft={current}
      doc={doc}
      canScan={ocr !== null}
      saving={save.pending}
      error={error}
      canDelete={existing !== null}
      onChange={(patch) => setDraft({ ...current, ...patch })}
      onScan={() => void scan()}
      onSave={() => void submit()}
      onDelete={() => void remove()}
    />
  );
}
