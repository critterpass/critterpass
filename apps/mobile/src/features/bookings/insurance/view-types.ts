export type DocState = 'none' | 'scanning' | 'attached' | 'failed';

export interface InsuranceDraft {
  readonly provider: string;
  readonly policyNo: string;
  readonly phone: string;
}
