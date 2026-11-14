import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
dotenv.config({ path: resolve(projectRoot, '.env') })

function databaseFromUrl(url) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  }
}

// Railway exposes MYSQL_URL / MYSQLHOST etc. Local development uses DB_* in .env.
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL
const db = databaseUrl
  ? databaseFromUrl(databaseUrl)
  : {
      host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
      port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
      database: process.env.DB_NAME || process.env.MYSQLDATABASE,
      user: process.env.DB_USER || process.env.MYSQLUSER,
      password: process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? ''
    }

if (!db.database) throw new Error('Missing database name. Set DB_NAME or DATABASE_URL.')
if (!db.user) throw new Error('Missing database user. Set DB_USER or DATABASE_URL.')
if (!process.env.JWT_SECRET) throw new Error('Missing required environment variable: JWT_SECRET')

const timezone = process.env.APP_TIMEZONE || '+08:00'
if (!/^[+-]\d{2}:\d{2}$/.test(timezone)) throw new Error('APP_TIMEZONE must look like +08:00')

const defaultOrigins = `${process.env.CLIENT_URL || 'http://localhost:5181'},http://localhost:5007`

export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 5007),
  allowedOrigins: (process.env.CLIENT_URLS || defaultOrigins).split(',').map((origin) => origin.trim()).filter(Boolean),
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  timezone,
  timezoneOffsetMinutes: (timezone.startsWith('-') ? -1 : 1) * (Number(timezone.slice(1, 3)) * 60 + Number(timezone.slice(4, 6))),
  seedDemoData: (process.env.SEED_DEMO_DATA || 'true').toLowerCase() !== 'false',
  owner: {
    name: process.env.OWNER_NAME || 'Renniels Owner',
    email: (process.env.OWNER_EMAIL || 'owner@renniels.local').toLowerCase(),
    password: process.env.OWNER_PASSWORD || 'Owner@12345'
  },
  cashierPassword: process.env.CASHIER_PASSWORD || 'Cashier@12345',
  db
}
