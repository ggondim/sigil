import 'dotenv/config';

const env = (key, fallback) => process.env[key] ?? fallback;

export default {
  client: 'pg',
  connection: {
    host: env('SIGIL_DB_HOST', 'localhost'),
    port: Number(env('SIGIL_DB_PORT', 5432)),
    database: env('SIGIL_DB_NAME', 'sigil'),
    user: env('SIGIL_DB_USER', 'sigil_app'),
    password: env('SIGIL_DB_PASSWORD', ''),
  },
  migrations: { directory: './src/db/migrations' },
};
