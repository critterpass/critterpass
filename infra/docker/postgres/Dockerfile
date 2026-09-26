# Local and test Postgres: same major (18) and extension set as PlanetScale production.
FROM pgvector/pgvector:0.8.6-pg18-trixie
COPY postgresql.conf /etc/postgresql/postgresql.conf
COPY init.sql /docker-entrypoint-initdb.d/00-init.sql
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
