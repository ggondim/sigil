import 'dotenv/config';

const env = (key, legacy, fallback) =>
  process.env[key] ?? (legacy && process.env[legacy]) ?? fallback;

export default {
  client: 'pg',
  connection: {
    host: env('SIGIL_DB_HOST', 'CORTEX_DB_HOST', 'localhost'),
    port: Number(env('SIGIL_DB_PORT', 'CORTEX_DB_PORT', 5432)),
    database: env('SIGIL_DB_NAME', 'CORTEX_DB_NAME', 'sigil'),
    user: env('SIGIL_DB_USER', 'CORTEX_DB_USER', 'sigil_app'),
    password: env('SIGIL_DB_PASSWORD', 'CORTEX_DB_PASSWORD', ''),
  },
  migrations: { directory: './src/db/migrations' },
};
