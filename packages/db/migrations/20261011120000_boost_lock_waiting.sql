-- Someone else is boosting the trip (9.22 "Tell me when it's done"): the members who asked to hear
-- how the lock ends. A purchase already tells every seated member (`boost_activated`); a lock that
-- lapses or is let go tells these members the trip is free to boost again. The column rides the
-- row's own policies (crew members read it), and only the server writes it.
ALTER TABLE boost_intents ADD COLUMN waiting_uids uuid[] NOT NULL DEFAULT '{}';
