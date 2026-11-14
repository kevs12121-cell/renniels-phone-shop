import bcrypt from 'bcryptjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { config } from '../config/env.js'
import { seedDemoData } from './demoSeed.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function columnInfo(connection, table, column) {
  const [rows] = await connection.query(
    'SELECT COLUMN_TYPE type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  )
  return rows[0] || null
}

async function ensureColumn(connection, table, column, definition) {
  if (!(await columnInfo(connection, table, column))) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
  }
}

async function indexExists(connection, table, index) {
  const [rows] = await connection.query(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
    [table, index]
  )
  return rows.length > 0
}

/** Upgrades databases created by earlier versions of the app. Every step is safe to re-run. */
async function upgrade(connection) {
  const role = await columnInfo(connection, 'users', 'role')
  if (role && role.type.includes('EMPLOYEE')) {
    await connection.query("ALTER TABLE users MODIFY role ENUM('OWNER', 'EMPLOYEE', 'CASHIER') NOT NULL DEFAULT 'CASHIER'")
    await connection.query("UPDATE users SET role = 'CASHIER' WHERE role = 'EMPLOYEE'")
    await connection.query("ALTER TABLE users MODIFY role ENUM('OWNER', 'CASHIER') NOT NULL DEFAULT 'CASHIER'")
  }
  await ensureColumn(connection, 'users', 'last_login_at', 'DATETIME NULL AFTER status')
  await ensureColumn(connection, 'sale_items', 'unit_cost', 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER unit_price')
  await ensureColumn(connection, 'sales', 'amount_tendered', 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER total')
  await ensureColumn(connection, 'sales', 'change_due', 'DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER amount_tendered')

  // A serialized unit can be sold again after a cancellation or return, so it cannot be unique per sale item.
  if (await indexExists(connection, 'sale_items', 'uq_sale_item_unit')) {
    if (!(await indexExists(connection, 'sale_items', 'idx_sale_items_unit'))) {
      await connection.query('CREATE INDEX idx_sale_items_unit ON sale_items (product_unit_id)')
    }
    await connection.query('DROP INDEX uq_sale_item_unit ON sale_items')
  }
}

const DEFAULT_CATEGORIES = [
  ['Smartphones', 'Android and iOS smartphones'],
  ['Feature Phones', 'Basic mobile phones'],
  ['Tablets', 'Tablet devices'],
  ['Chargers', 'Wall and travel chargers'],
  ['Cables', 'Charging and data cables'],
  ['Phone Cases', 'Protective phone cases'],
  ['Screen Protectors', 'Screen protection accessories'],
  ['Earphones', 'Wired and wireless audio'],
  ['Power Banks', 'Portable battery packs'],
  ['Other Accessories', 'Miscellaneous phone accessories']
]

/** Only seeds categories into an empty table, so renamed or removed categories are never re-created. */
async function ensureDefaultCategories(connection) {
  const [[{ total }]] = await connection.query('SELECT COUNT(*) total FROM categories')
  if (total === 0) await connection.query('INSERT INTO categories (category_name, description) VALUES ?', [DEFAULT_CATEGORIES])
}

async function ensureOwner(connection) {
  const [[existing]] = await connection.query("SELECT COUNT(*) total FROM users WHERE role = 'OWNER'")
  if (existing.total > 0) return
  const hash = await bcrypt.hash(config.owner.password, 12)
  await connection.query(
    "INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'OWNER', 'ACTIVE') ON DUPLICATE KEY UPDATE role = 'OWNER', status = 'ACTIVE'",
    [config.owner.name, config.owner.email, hash]
  )
  console.log(`Owner account created for ${config.owner.email}`)
}

export async function migrate({ log = console.log } = {}) {
  const connection = await mysql.createConnection({ ...config.db, database: undefined, timezone: config.timezone, decimalNumbers: true })
  try {
    await connection.query(`SET time_zone = '${config.timezone}'`)
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    } catch (error) {
      log(`Skipping CREATE DATABASE (${error.code}); using existing database.`)
    }
    await connection.query(`USE \`${config.db.database}\``)

    const schema = await fs.readFile(path.join(projectRoot, 'database', 'schema.sql'), 'utf8')
    const statements = schema
      .split(/;\s*(?:\r?\n|$)/)
      .map((part) => part.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean)
    for (const statement of statements) await connection.query(statement)

    await upgrade(connection)
    await ensureDefaultCategories(connection)
    await ensureOwner(connection)

    if (config.seedDemoData) {
      const seeded = await seedDemoData(connection, { log })
      if (seeded) log('Demo data loaded.')
    }
    log(`Database ready: ${config.db.database}`)
  } finally {
    await connection.end()
  }
}
