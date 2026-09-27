-- Devices, roundups and scheduled deliveries store a time zone too: canonicalize it on write the
-- same way users, trips and timers do (app.canonicalize_tz), so an Apple `Asia/Saigon` from any
-- writer is stored as `Asia/Ho_Chi_Minh` and passes the tz check.
CREATE TRIGGER devices_canonical_tz BEFORE INSERT OR UPDATE OF tz ON devices
  FOR EACH ROW EXECUTE FUNCTION app.canonicalize_tz();
CREATE TRIGGER roundups_canonical_tz BEFORE INSERT OR UPDATE OF tz ON roundups
  FOR EACH ROW EXECUTE FUNCTION app.canonicalize_tz();
CREATE TRIGGER scheduled_deliveries_canonical_tz BEFORE INSERT OR UPDATE OF tz ON scheduled_deliveries
  FOR EACH ROW EXECUTE FUNCTION app.canonicalize_tz();
