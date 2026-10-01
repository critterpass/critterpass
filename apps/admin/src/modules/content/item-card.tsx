import type { ContentBatchItem } from '@cp/domain';

import { CritterPreview } from './critter-preview';
import { itemFace } from './items';

const VERDICT_MARK: Readonly<Record<ContentBatchItem['verdict'], string>> = {
  pending: '?',
  keep: '✓',
  reject: '✕',
};

export function ItemCard({
  kind,
  item,
  selected,
  onSelect,
}: {
  kind: string;
  item: ContentBatchItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const face = itemFace(kind, item.ref, item.item);
  return (
    <button
      type="button"
      className="cb-item"
      aria-pressed={selected}
      aria-label={`${face.title} ${item.severity}`}
      onClick={onSelect}
    >
      {face.critterId !== undefined && (
        <CritterPreview critterId={face.critterId} form={face.form} size={56} label={face.title} />
      )}
      {face.imageUrl !== undefined && (
        <img className="cb-item-image" src={face.imageUrl} alt="" loading="lazy" />
      )}
      <span className="cb-item-title">{face.title}</span>
      <span className="cb-item-sub muted">{face.subtitle}</span>
      <span className="row cb-item-foot">
        <span
          className="badge"
          data-tone={
            item.severity === 'pass' ? 'success' : item.severity === 'warn' ? 'warning' : 'urgent'
          }
        >
          {item.severity}
        </span>
        <span
          className="cb-mark"
          data-verdict={item.verdict}
          aria-label={`verdict ${item.verdict}`}
        >
          {VERDICT_MARK[item.verdict]}
        </span>
      </span>
    </button>
  );
}
