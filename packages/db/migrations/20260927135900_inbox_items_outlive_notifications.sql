-- Notifications are purged after 90 days (maint.purge), while an unresolved inbox item may point at
-- the notification that created it for longer. The item keeps its own copy of what it needs, so the
-- link is cleared rather than blocking the purge.
ALTER TABLE inbox_items DROP CONSTRAINT inbox_items_notification_id_fkey;
ALTER TABLE inbox_items
  ADD CONSTRAINT inbox_items_notification_id_fkey FOREIGN KEY (notification_id)
  REFERENCES notifications (id) ON DELETE SET NULL;
