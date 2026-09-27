/** Private ports and database for the console suite, clear of the shared local infra ports. */
export const E2E_API_PORT = 8791;
export const E2E_WEB_PORT = 5181;
export const E2E_DB_PORT = 54391;
export const E2E_DB_CONTAINER = 'cp-admin-e2e-postgres';
export const E2E_DATABASE_URL = `postgres://app_owner:app_owner@localhost:${E2E_DB_PORT}/critterpass`;
