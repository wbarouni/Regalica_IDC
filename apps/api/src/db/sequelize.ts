import { Sequelize } from 'sequelize';

import { config } from '../config';
import { logger } from '../logger';

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: (sql: string) => logger.debug({ sql }, 'sequelize query'),
  dialectOptions: {
    ssl:
      config.isProd
        ? { require: true, rejectUnauthorized: false }
        : false,
  },
  pool: {
    max: 10,
    min: 2,
    acquire: 30_000,
    idle: 10_000,
  },
});
