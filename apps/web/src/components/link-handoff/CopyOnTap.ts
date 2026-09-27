/* eslint-disable lingui/no-unlocalized-strings -- DOM attribute names, not UI copy. */
/**
 * Client behaviour of the link handoff: store and open taps copy the invite link first (so the app
 * can offer it back after install on iOS, without ever reading the clipboard silently), copy-only
 * buttons, the "different code" form, and dismissing the in-app browser overlay.
 */
import { normalizeJoinCode } from '@cp/domain';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function wireCopyThenGo(anchor: HTMLAnchorElement): void {
  anchor.addEventListener('click', (event) => {
    const link = anchor.dataset.copyLink;
    if (link === undefined || typeof navigator.clipboard === 'undefined') return;
    event.preventDefault();
    const href = anchor.href;
    void copy(link).finally(() => {
      window.location.href = href;
    });
  });
}

function wireCopyOnly(button: HTMLButtonElement): void {
  button.addEventListener('click', () => {
    const link = button.dataset.copyOnly;
    if (link === undefined) return;
    void copy(link).then((copied) => {
      button.dataset.copied = copied ? 'true' : 'false';
    });
  });
}

function wireCodeForm(form: HTMLFormElement): void {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector<HTMLInputElement>('input[name="code"]');
    const code = normalizeJoinCode(input?.value ?? '');
    if (code === null) {
      form.dataset.invalid = 'true';
      input?.focus();
      return;
    }
    window.location.href = `/i/${code}`;
  });
  form.addEventListener('input', () => {
    delete form.dataset.invalid;
  });
}

export function wireLinkHandoff(root: ParentNode = document): void {
  root.querySelectorAll<HTMLAnchorElement>('a[data-copy-link]').forEach(wireCopyThenGo);
  root.querySelectorAll<HTMLButtonElement>('button[data-copy-only]').forEach(wireCopyOnly);
  root.querySelectorAll<HTMLFormElement>('form[data-code-form]').forEach(wireCodeForm);
  root.querySelectorAll<HTMLElement>('[data-escape-dismiss]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector<HTMLElement>('[data-escape]')?.setAttribute('hidden', '');
    });
  });
}
