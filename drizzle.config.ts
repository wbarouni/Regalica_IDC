import type { Config } from 'drizzle-kit'

const connectionString = process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/regalica_idc'

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  driver: 'mysql2',
  dbCredentials: {
    uri: connectionString,
  },
} satisfies Config
