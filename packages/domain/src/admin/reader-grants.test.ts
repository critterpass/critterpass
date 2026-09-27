import { describe, expect, it } from 'vitest';

import type { TablePrivacy } from '../privacy';
import { computeAdminReaderGrants, renderAdminReaderGrantSql } from './reader-grants';

const privacy: Record<string, TablePrivacy> = {
  users: { class: 'C1', columns: { home_currency: 'C2' } },
  user_private: { class: 'C3' },
  mixed: { class: 'C2', columns: { secret_hash: 'C3', face_vector: 'C4' } },
  ledger: { class: 'C5' },
};

describe('computeAdminReaderGrants', () => {
  it('keeps every non-C3/C4 column of registered tables and drops unregistered tables', () => {
    const grants = computeAdminReaderGrants(
      [
        { table: 'users', columns: ['id', 'name', 'home_currency'] },
        { table: 'user_private', columns: ['user_id', 'phone_hash'] },
        { table: 'mixed', columns: ['id', 'secret_hash', 'face_vector', 'note'] },
        { table: 'ledger', columns: ['id', 'amount_minor'] },
        { table: 'cmd_log', columns: ['op_id'] },
      ],
      (table) => privacy[table],
    );
    expect(grants).toEqual([
      { table: 'ledger', columns: ['amount_minor', 'id'] },
      { table: 'mixed', columns: ['id', 'note'] },
      { table: 'users', columns: ['home_currency', 'id', 'name'] },
    ]);
  });

  it('renders a column grant and a read-all policy', () => {
    expect(renderAdminReaderGrantSql({ table: 'users', columns: ['id', 'name'] })).toBe(
      'GRANT SELECT (id, name) ON users TO admin_reader;\n' +
        'CREATE POLICY users_admin_reader ON users FOR SELECT TO admin_reader USING (true);',
    );
  });
});
