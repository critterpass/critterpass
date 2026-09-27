import { t } from '@lingui/core/macro';
import { Linking } from 'react-native';

import { PillButton } from '../buttons/PillButton';
import { ActionCard } from '../cards/ActionCard';
import type { DoodleName } from '../icons/generated';
import { Icon } from '../icons/Icon';

export interface PermissionCardProps {
  /** What stops working without it ("No location, no leave-by alarms"). */
  readonly title: string;
  /** The benefit, in the guide's words, without guilt. */
  readonly body: string;
  readonly icon?: DoodleName;
  /** The working fallback that keeps the flow alive (type a place, pick photos). */
  readonly fallback: { readonly label: string; readonly onPress: () => void };
  /** Defaults to opening this app's page in system Settings. */
  readonly onOpenSettings?: () => void;
  readonly testID?: string;
}

/** Inline card for a denied permission: what is lost, "Open Settings", and a working fallback. */
export function PermissionCard({
  title,
  body,
  icon = 'lock',
  fallback,
  onOpenSettings,
  testID,
}: PermissionCardProps) {
  const openSettings = onOpenSettings ?? (() => void Linking.openSettings());
  return (
    <ActionCard
      title={title}
      body={body}
      leading={<Icon name={icon} size={32} decorative />}
      actions={
        <>
          <PillButton
            size="sm"
            label={t({ id: 'common.permission.openSettings', message: 'Open Settings' })}
            onPress={openSettings}
          />
          <PillButton
            size="sm"
            variant="secondary"
            label={fallback.label}
            onPress={fallback.onPress}
          />
        </>
      }
      {...(testID ? { testID } : {})}
    />
  );
}
