import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'auth_user',
  password: process.env.DB_PASSWORD || 'auth-password-change-me',
  database: process.env.DB_NAME || 'auth_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

export const pool = mysql.createPool(dbConfig);

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      balance_cents INT NOT NULL DEFAULT 0,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      full_name VARCHAR(160),
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deposits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount_cents INT NOT NULL,
      currency VARCHAR(8) NOT NULL DEFAULT 'USD',
      provider VARCHAR(40) NOT NULL DEFAULT 'cloakd',
      provider_reference VARCHAR(255),
      checkout_url TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount_cents INT NOT NULL,
      currency VARCHAR(8) NOT NULL DEFAULT 'USD',
      wallet_address VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn('users', 'balance_cents', 'balance_cents INT NOT NULL DEFAULT 0');
  await ensureColumn('users', 'is_admin', 'is_admin BOOLEAN NOT NULL DEFAULT FALSE');
  await ensureColumn('users', 'full_name', 'full_name VARCHAR(160)');
  await ensureColumn('users', 'status', "status VARCHAR(32) NOT NULL DEFAULT 'active'");
}

async function ensureColumn(table, column, definition) {
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [table, column]
  );

  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}
