import * as mysql2 from 'mysql2/promise';

/**
 * Le driver MySQL de TypeORM ignore `createDatabaseIfNotExist` (option propre à sql.js) :
 * sans cette amorce, la connexion échoue en `Unknown database` sur une machine neuve.
 */
export async function ensureMySQLDatabase(options: {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}): Promise<void> {
  // Nom de base échappé : seul un identifiant MySQL sûr traverse les backticks.
  const database = options.database.replace(/[^A-Za-z0-9_$]/g, '');
  if (!database) throw new Error('MYSQL_DATABASE invalide');

  const connection = await mysql2.createConnection({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
  });
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}
