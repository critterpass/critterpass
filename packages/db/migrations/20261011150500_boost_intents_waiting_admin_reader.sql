-- The admin console reads who is waiting on a boost lock, like the rest of the boost intent row.

GRANT SELECT (waiting_uids) ON boost_intents TO admin_reader;
