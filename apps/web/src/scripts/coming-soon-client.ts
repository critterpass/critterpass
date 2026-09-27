/* eslint-disable lingui/no-unlocalized-strings -- vanilla DOM copy, not JSX/<Trans>; the coming-soon
   page ships single-locale English and isn't wired through @cp/i18n yet (see report follow-ups). */
/**
 * Coming-soon page controller: chip/boarding-pass sync, the join form and its D1-backed waitlist
 * calls, the joined panel (referral link, sharing, reset), the egg-hatch mini-game, and refreshing
 * the real header/first-wave numbers. One instance per page load; no framework, just DOM.
 */
import type { Guide } from '../lib/guides';
import { guideForDestination } from '../lib/guides';
import { HATCH_POOL } from '../lib/hatch-pool';
import { DEFAULT_DESTINATION, findDestination } from '../lib/waitlist';
import { burstConfetti } from './confetti';
import { startCountdown } from './countdown';
import { csAll, csEl, formatCount } from './dom';
import { startTypedText } from './typed-text';
import type { HandleResponse } from './waitlist-api';
import { fetchHandle, fetchStats, joinWaitlist } from './waitlist-api';

const STORAGE_KEY = 'cp-waitlist-handle';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HINT_BY_TAPS = ['tap the egg', 'crk!', 'CRRRK!!'] as const;
const EGG_TRANSFORM_BY_TAPS = [
  'rotate(0deg)',
  'rotate(-12deg) scale(1.05)',
  'rotate(14deg) scale(1.12)',
] as const;

export interface ComingSoonConfig {
  readonly referredBy: string | null;
  readonly launchAt: string | null;
}

function setText(el: Element | null, value: string): void {
  if (el) el.textContent = value;
}

export function startComingSoonPage(config: ComingSoonConfig): void {
  const root = document;
  let selectedDestination: string = DEFAULT_DESTINATION.key;
  let currentReferralUrl: string | null = null;
  let eggTaps = 0;
  let eggSeed = 12;
  let hatchCycle = -1;

  startTypedText(csEl(root, 'typed-text'), 'The locals are still packing.');
  startCountdown(
    [csEl(root, 'pass-gate'), csEl(root, 'final-gate')].filter(
      (el): el is HTMLElement => el !== null,
    ),
    config.launchAt,
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
      note.textContent = isError
        ? (message ?? "That email doesn't look right. Mind checking it?")
        : 'One email when we launch. Maybe two. Never spam.';
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
    setText(csEl(root, 'ticket-title'), 'CONFIRMED · FIRST WAVE');
    setText(csEl(root, 'nav-cta'), `YOU'RE #${formatCount(data.position)}`);
    setText(csEl(root, 'final-cta'), 'SHARE YOUR LINK ↑');
    setText(csEl(root, 'spot-value'), formatCount(data.position));
    setText(csEl(root, 'pass-seat'), formatCount(data.position));
    setText(csEl(root, 'joined-guide-name'), data.guide.name);
    setText(csEl(root, 'joined-guide-place'), data.guide.place);
    const joinedCritter = csEl(root, 'joined-guide-critter');
    if (joinedCritter) {
      joinedCritter.setAttribute('kind', data.guide.kind);
      joinedCritter.setAttribute('seed', String(data.guide.seed));
    }

    const referralPath = `critterpass.app/w/${data.handle}`;
    currentReferralUrl = `https://${referralPath}`;
    setText(csEl(root, 'referral-link'), referralPath);
    const shareText = `Come join me on CritterPass — ${currentReferralUrl}`;
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
    setText(csEl(root, 'ticket-title'), 'WAITLIST · FIRST WAVE');
    setText(csEl(root, 'nav-cta'), 'JOIN THE WAITLIST');
    setText(csEl(root, 'final-cta'), 'SAVE MY SEAT ↑');
    setText(csEl(root, 'pass-seat'), '— —');
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
      setError(
        true,
        outcome.status === 429 ? 'Too many attempts — try again in a few minutes.' : undefined,
      );
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
    const original = button.textContent ?? 'COPY LINK';
    button.dataset['copied'] = 'true';
    button.textContent = 'COPIED ✓';
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
          text: 'Come join me on CritterPass',
          url: currentReferralUrl,
        });
        return;
      } catch {
        // Cancelled or unsupported mid-call — fall back to copying the link below.
      }
    }
    await copyReferralLink(event.currentTarget as HTMLButtonElement);
  }

  function updateEggUi(): void {
    setText(csEl(root, 'egg-hint'), HINT_BY_TAPS[eggTaps] ?? HINT_BY_TAPS[0]);
    const button = csEl(root, 'egg-button');
    if (button) button.style.transform = EGG_TRANSFORM_BY_TAPS[eggTaps] ?? 'none';
    const dots = csEl(root, 'tap-dots')?.children ?? [];
    Array.from(dots).forEach((dot, index) =>
      dot.setAttribute('data-filled', String(index < eggTaps)),
    );
  }

  function onEggTap(): void {
    if (eggTaps < 2) {
      eggTaps += 1;
      updateEggUi();
      return;
    }
    hatchCycle = (hatchCycle + 1) % HATCH_POOL.length;
    eggTaps = 0;
    const local = HATCH_POOL[hatchCycle];
    if (!local) return;
    csEl(root, 'egg-not-hatched')?.setAttribute('hidden', '');
    csEl(root, 'egg-hatched')?.removeAttribute('hidden');
    setText(csEl(root, 'hatched-num'), `#${local.num}`);
    setText(csEl(root, 'hatched-city'), local.city);
    setText(csEl(root, 'hatched-name'), local.name);
    setText(csEl(root, 'hatched-species'), `${local.species}, waiting for you in ${local.place}.`);
    const critter = csEl(root, 'hatched-critter');
    if (critter) {
      critter.setAttribute('kind', local.id);
      critter.setAttribute('seed', '1');
    }
    burstConfetti(csEl(root, 'egg-confetti'));
  }

  function onHatchAgain(): void {
    eggTaps = 0;
    eggSeed += 7;
    const eggCritter = csEl(root, 'egg-critter');
    if (eggCritter) eggCritter.setAttribute('seed', String(eggSeed));
    updateEggUi();
    csEl(root, 'egg-hatched')?.setAttribute('hidden', '');
    csEl(root, 'egg-not-hatched')?.removeAttribute('hidden');
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
  csEl(root, 'egg-button')?.addEventListener('click', onEggTap);
  csEl(root, 'hatch-again')?.addEventListener('click', onHatchAgain);

  void restoreJoinedFromStorage().then(refreshStats);
}
