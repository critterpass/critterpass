-- Critter stickers in the crew chat. A sticker is a member's message of type `sticker` that points
-- at one critter form (`ref_kind = 'critter_form'`, `ref_id` the form) and carries its pose in
-- `body`; the caption is fixed per pose and drawn by the app. A member may only send a form they
-- have met (a collection entry that was not revoked), and a member's row may carry no other
-- reference, so cards stay system-written.
--
-- Critter reactions need no schema change: `message_reactions.emoji` already holds any key up to
-- 16 characters, and the api accepts `c<dex no>.<pose>` beside emoji.

ALTER TABLE messages DROP CONSTRAINT messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check CHECK (type IN (
  'text', 'photo', 'voice', 'system', 'poll', 'expense', 'guide_offer', 'changeset',
  'boost_card', 'meetup', 'proposal', 'supplier_order', 'sticker'
));
ALTER TABLE messages ADD CONSTRAINT messages_sticker_shape CHECK (
  type <> 'sticker' OR (
    ref_kind = 'critter_form' AND ref_id IS NOT NULL AND attachments = '[]'::jsonb
    AND (deleted_at IS NOT NULL OR body IN ('wave', 'cheer', 'think', 'point', 'sleep'))
  )
);

GRANT INSERT (ref_kind, ref_id) ON messages TO app_user;

DROP POLICY messages_insert ON messages;
CREATE POLICY messages_insert ON messages FOR INSERT TO app_user
  WITH CHECK (
    sender_kind = 'user' AND sender_id = app.uid() AND hidden_at IS NULL
    AND app.is_crew_member(crew_id)
    AND (
      (type <> 'sticker' AND ref_kind IS NULL AND ref_id IS NULL)
      OR (
        type = 'sticker' AND EXISTS (
          SELECT 1 FROM collection_entries e
           WHERE e.user_id = app.uid() AND e.form_id = messages.ref_id
             AND e.verification <> 'revoked'
        )
      )
    )
  );
