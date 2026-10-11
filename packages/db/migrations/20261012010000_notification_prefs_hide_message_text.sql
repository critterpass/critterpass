-- Lock-screen privacy for messages: on, a crew chat push and a push the guide writes say only that
-- something new is waiting ("New message in Bali crew"), never the words themselves. Who sent it
-- stays in the title. Set by the person through `set_notification_prefs`; the column rides the
-- row's existing policies (each person reads and writes only their own row) and its class (C2).
ALTER TABLE notification_prefs ADD COLUMN hide_message_text boolean NOT NULL DEFAULT false;
