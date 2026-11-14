import bcrypt from 'bcryptjs'
import { pool } from './config/db.js'
import { config } from './config/env.js'

const ownerPassword = process.env.OWNER_PASSWORD
if (!ownerPassword) throw new Error('Set OWNER_PASSWORD in .env before running the seed.')

const passwordHash = await bcrypt.hash(ownerPassword, 12)
await pool.execute(
  `INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'OWNER', 'ACTIVE')
   ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'OWNER', status = 'ACTIVE'`,
  [process.env.OWNER_NAME || 'Renniels Owner', process.env.OWNER_EMAIL || 'owner@renniels.local', passwordHash]
)
console.log(`Owner seed complete for ${process.env.OWNER_EMAIL || 'owner@renniels.local'}`)
await pool.end()
