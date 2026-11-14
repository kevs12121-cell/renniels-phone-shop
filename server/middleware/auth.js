import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { pool } from '../config/db.js'

/** Verifies the JWT and reloads the user so deactivated accounts and role changes take effect immediately. */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ message: 'Authentication required.' })

  let payload
  try {
    payload = jwt.verify(token, config.jwtSecret)
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' })
  }

  try {
    const [[user]] = await pool.query('SELECT id, name, email, role, status FROM users WHERE id = ?', [payload.id])
    if (!user || user.status !== 'ACTIVE') return res.status(401).json({ message: 'This account is no longer active.' })
    req.user = user
    next()
  } catch (error) {
    next(error)
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'You do not have permission for this action.' })
    next()
  }
}

export const ownerOnly = authorize('OWNER')
