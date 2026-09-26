-- Extensions every environment provides (enabled on PlanetScale too).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Empty logical-replication publication for PowerSync; schema migrations add tables to it.
CREATE PUBLICATION powersync;
