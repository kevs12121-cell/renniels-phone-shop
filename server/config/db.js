import mysql from 'mysql2/promise'
import { config } from './env.js'

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  timezone: config.timezone,
  // DATE columns (purchase_date, warranty_until) stay as 'YYYY-MM-DD' strings so they never shift across timezones.
  dateStrings: ['DATE']
})

// Keep NOW(), CURRENT_DATE() and DATE() aligned with the shop's local time (Philippines by default).
pool.on('connection', (connection) => {
  connection.query(`SET time_zone = '${config.timezone}'`)
})

export async function withTransaction(work) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
