-- A member can mark one payout method as their default ("the one people see first"). The payer's
-- reveal and the owner's own list both put it first; at most one live method per member is the
-- default.

ALTER TABLE payout_methods ADD COLUMN is_default boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX payout_methods_user_default_uk ON payout_methods (user_id)
  WHERE is_default AND deleted_at IS NULL;

GRANT INSERT (is_default), UPDATE (is_default) ON payout_methods TO app_user;

CREATE OR REPLACE FUNCTION app.reveal_payout(p_payment uuid)
RETURNS TABLE (method_id uuid, kind text, country char(2), label text, details_enc text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  payee uuid;
BEGIN
  SELECT p.to_id INTO payee FROM payments p
   WHERE p.id = p_payment AND p.from_id = app.uid()
     AND p.status IN ('pending', 'requested', 'marked_paid', 'disputed')
     AND app.is_crew_member(p.crew_id);
  IF payee IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO ops.reveal_audit (kind, subject_id, owner_id, viewer_id)
  VALUES ('payout', p_payment, payee, app.uid());
  RETURN QUERY
    SELECT m.id, m.kind, m.country, m.label, m.details_enc FROM payout_methods m
     WHERE m.user_id = payee AND m.deleted_at IS NULL
     ORDER BY m.is_default DESC, m.kind;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.reveal_payout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reveal_payout(uuid) TO app_user;
