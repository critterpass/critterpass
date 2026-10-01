/* eslint-disable lingui/no-unlocalized-strings -- selectors, URLs and style values; every word the
   page shows arrives translated in `config.strings` (src/scripts/page-strings.ts). */
/**
 * Coming-soon page controller: chip/boarding-pass sync, the join form and its D1-backed waitlist
 * calls, the joined panel (referral link, sharing, reset), and refreshing the real header and
 * first-wave numbers. One instance per page load; no framework, just DOM.
 */
import type { Guide } from '../lib/guides';
import { guideForDestination } from '../lib/guides';
import { DEFAULT_DESTINATION, findDestination } from '../lib/waitlist';
import { burstConfetti } from './confetti';
import { startCountdown } from './countdown';
import { csAll, csEl, formatCount, setText } from './dom';
import { startEggHatch } from './egg-hatch';
import { fill } from './page-strings';
import type { PageStrings } from './page-strings';
import { startTypedText } from './typed-text';
import type { HandleResponse } from './waitlist-api';
import { fetchHandle, fetchStats, joinWaitlist } from './waitlist-api';

const STORAGE_KEY = 'cp-waitlist-handle';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEAT_EMPTY = '— —';

export interface ComingSoonConfig {
  readonly referredBy: string | null;
  readonly launchAt: string | null;
  readonly strings: PageStrings;
}

export function startComingSoonPage(config: ComingSoonConfig): void {
  const root = document;
  const { strings } = config;
  let selectedDestination: string = DEFAULT_DESTINATION.key;
  let currentReferralUrl: string | null = null;

  startTypedText(csEl(root, 'typed-text'), strings.typedLine);
  startCountdown(
    [csEl(root, 'pass-gate'), csEl(root, 'final-gate')].filter(
      (el): el is HTMLElement => el !== null,
    ),
    config.launchAt,
    strings,
  );

  function selectDestination(destinationKey: string): void {
    const destination = findDestination(destinationKey);
    if (!destination) return;
    selectedDestination = destinationKey;
    const guide = guideForDestination(destinationKey);
    for (const chip of csAll(root, 'chip')) {
      const isActive = chip.dataset['destination'] === destinationKey;
      chip.setAttribute('aria-pressed', String(isActive));
      chip.style.background = isActive ? guide.bg : '';
      chip.style.borderColor = isActive ? 'var(--color-ink-850)' : '';
    }
    updateBoardingPass(guide);
  }

  function updateBoardingPass(guide: Guide): void {
    const pass = csEl(root, 'pass');
    if (pass) pass.style.background = guide.bg;
    setText(csEl(root, 'pass-no'), guide.no);
    setText(csEl(root, 'pass-city'), guide.city);
    setText(csEl(root, 'pass-guide-name'), guide.name);
    const critter = csEl(root, 'pass-critter');
    if (critter) {
      critter.setAttribute('kind', guide.kind);
      critter.setAttribute('seed', String(guide.seed));
    }
  }

  function wireChips(): void {
    for (const chip of csAll(root, 'chip')) {
      chip.addEventListener('click', () => {
        const destinationKey = chip.dataset['destination'];
        if (destinationKey) selectDestination(destinationKey);
      });
    }
  }

  function setError(isError: boolean, message?: string): void {
    const emailInput = csEl<HTMLInputElement>(root, 'email-input');
    const note = csEl(root, 'join-note');
    if (emailInput) emailInput.dataset['invalid'] = String(isError);
    if (note) {
      note.dataset['error'] = String(isError);
      note.textContent = isError ? (message ?? strings.emailInvalid) : strings.note;
    }
  }

  function updateFriends(count: number): void {
    const avatars = csAll(root, 'friends-avatars')[0]?.children ?? [];
    Array.from(avatars).forEach((avatar, index) => {
      avatar.setAttribute('data-filled', String(index < count));
    });
    setText(csEl(root, 'friends-count'), String(Math.min(count, 3)));
  }

  function showJoinedPanel(data: {
    handle: string;
    position: number;
    guide: Guide;
    friendsJoined: number;
  }): void {
    csEl(root, 'join-form')?.setAttribute('hidden', '');
    csEl(root, 'joined-panel')?.removeAttribute('hidden');
    setText(csEl(root, 'ticket-title'), strings.ticketConfirmed);
    setText(
      csEl(root, 'nav-cta'),
      fill(strings.navJoined, { position: formatCount(data.position) }),
    );
    setText(csEl(root, 'final-cta'), strings.finalShare);
    setText(csEl(root, 'spot-value'), formatCount(data.position));
    setText(csEl(root, 'pass-seat'), formatCount(data.position));
    setText(
      csEl(root, 'joined-line'),
      fill(strings.savingSeat, { name: data.guide.name, place: data.guide.place }),
    );
    const joinedCritter = csEl(root, 'joined-guide-critter');
    if (joinedCritter) {
      joinedCritter.setAttribute('kind', data.guide.kind);
      joinedCritter.setAttribute('seed', String(data.guide.seed));
    }

    const referralPath = `critterpass.app/w/${data.handle}`;
    currentReferralUrl = `https://${referralPath}`;
    setText(csEl(root, 'referral-link'), referralPath);
    const shareText = fill(strings.shareText, { url: currentReferralUrl });
    const whatsapp = csEl<HTMLAnchorElement>(root, 'share-whatsapp');
    if (whatsapp) whatsapp.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    const messages = csEl<HTMLAnchorElement>(root, 'share-messages');
    if (messages) messages.href = `sms:?&body=${encodeURIComponent(shareText)}`;

    updateFriends(data.friendsJoined);
  }

  function showForm(): void {
    localStorage.removeItem(STORAGE_KEY);
    csEl(root, 'joined-panel')?.setAttribute('hidden', '');
    csEl(root, 'join-form')?.removeAttribute('hidden');
    setText(csEl(root, 'ticket-title'), strings.ticketWaitlist);
    setText(csEl(root, 'nav-cta'), strings.navJoin);
    setText(csEl(root, 'final-cta'), strings.finalJoin);
    setText(csEl(root, 'pass-seat'), SEAT_EMPTY);
    const emailInput = csEl<HTMLInputElement>(root, 'email-input');
    if (emailInput) emailInput.value = '';
    setError(false);
  }

  async function refreshStats(): Promise<void> {
    const stats = await fetchStats();
    if (!stats) return;
    setText(csEl(root, 'header-count'), formatCount(stats.count));
    setText(csEl(root, 'wave-left'), formatCount(stats.waveLeft));
    setText(csEl(root, 'wave-count'), formatCount(stats.count));
    setText(csEl(root, 'final-wave-left'), formatCount(stats.waveLeft));
    const fill = csEl(root, 'wave-fill');
    if (fill) fill.style.width = `${stats.wavePercent}%`;
  }

  async function onSubmitJoin(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const emailInput = csEl<HTMLInputElement>(form, 'email-input');
    const submitButton = csEl<HTMLButtonElement>(form, 'join-submit');
    const honeypot = form.querySelector<HTMLInputElement>('input[name="company"]');
    const email = emailInput?.value.trim() ?? '';
    if (!EMAIL_PATTERN.test(email)) {
      setError(true);
      return;
    }
    setError(false);
    if (submitButton) submitButton.disabled = true;
    const outcome = await joinWaitlist({
      email,
      destination: selectedDestination,
      referredBy: config.referredBy,
      company: honeypot?.value ?? '',
    });
    if (submitButton) submitButton.disabled = false;
    if (!outcome.ok) {
      // 400 is the server refusing the address; anything else is the line, not the visitor.
      const message =
        outcome.status === 429
          ? strings.rateLimited
          : outcome.status === 400
            ? strings.emailInvalid
            : strings.joinFailed;
      setError(true, message);
      return;
    }
    localStorage.setItem(STORAGE_KEY, outcome.data.handle);
    selectDestination(outcome.data.destination);
    showJoinedPanel({
      handle: outcome.data.handle,
      position: outcome.data.position,
      guide: guideForDestination(outcome.data.destination),
      friendsJoined: 0,
    });
    burstConfetti(csEl(root, 'hero-confetti'));
    void refreshStats();
  }

  async function copyReferralLink(button: HTMLButtonElement | null): Promise<void> {
    if (!currentReferralUrl || !button) return;
    try {
      await navigator.clipboard.writeText(currentReferralUrl);
    } catch {
      // Clipboard permission denied or unavailable — the link text is still visible to copy by hand.
    }
    const original = button.textContent ?? '';
    button.dataset['copied'] = 'true';
    button.textContent = strings.copied;
    setTimeout(() => {
      button.dataset['copied'] = 'false';
      button.textContent = original;
    }, 2000);
  }

  async function onInstagramShare(event: Event): Promise<void> {
    if (!currentReferralUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CritterPass',
          text: strings.shareTitle,
          url: currentReferralUrl,
        });
        return;
      } catch {
        // Cancelled or unsupported mid-call — fall back to copying the link below.
      }
    }
    await copyReferralLink(event.currentTarget as HTMLButtonElement);
  }

  async function restoreJoinedFromStorage(): Promise<void> {
    const storedHandle = localStorage.getItem(STORAGE_KEY);
    if (!storedHandle) return;
    const data: HandleResponse | null = await fetchHandle(storedHandle);
    if (!data) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    selectDestination(data.destination);
    showJoinedPanel({
      handle: data.handle,
      position: data.position,
      guide: guideForDestination(data.destination),
      friendsJoined: data.friendsJoined,
    });
  }

  // Wiring.
  selectDestination(DEFAULT_DESTINATION.key);
  wireChips();
  csEl<HTMLFormElement>(root, 'join-form')?.addEventListener('submit', (event) => {
    void onSubmitJoin(event);
  });
  csEl(root, 'reset-email')?.addEventListener('click', showForm);
  csEl<HTMLButtonElement>(root, 'copy-link')?.addEventListener('click', (event) => {
    void copyReferralLink(event.currentTarget as HTMLButtonElement);
  });
  csEl(root, 'share-instagram')?.addEventListener('click', (event) => {
    void onInstagramShare(event);
  });
  startEggHatch(root, strings);

  void restoreJoinedFromStorage().then(refreshStats);
}
