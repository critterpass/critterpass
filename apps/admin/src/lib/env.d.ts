/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `true` only in local development builds: shows the dev sign-in door for seeded operators. */
  readonly VITE_ADMIN_DEV_SIGN_IN?: string;
  /** Link-outs on Home; hidden when unset. */
  readonly VITE_UPTIME_URL?: string;
  readonly VITE_GRAFANA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
