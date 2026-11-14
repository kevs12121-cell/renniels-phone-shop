import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'
import { config } from '../config/env.js'
import { auditWithPool } from '../utils/audit.js'
import { fail } from '../utils/http.js'

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status }
}

export async function login(req, res) {
  const [[user]] = await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [String(req.body.email).toLowerCase().trim()])
  if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password.' })
  }
  if (user.status !== 'ACTIVE') return res.status(403).json({ message: 'This account has been deactivated. Please contact the owner.' })
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
  await auditWithPool(user.id, 'LOGIN', 'USER', user.id, 'Signed in')
  const token = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn })
  res.json({ token, user: safeUser(user) })
}

export async function me(req, res) {
  res.json({ user: safeUser(req.user) })
}

export async function logout(req, res) {
  await auditWithPool(req.user.id, 'LOGOUT', 'USER', req.user.id, 'Signed out')
  res.json({ message: 'Logged out successfully.' })
}

export async function updateProfile(req, res) {
  const name = String(req.body.name || '').trim()
  if (!name) fail('Name is required.', 422)
  await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id])
  await auditWithPool(req.user.id, 'PROFILE_UPDATE', 'USER', req.user.id, 'Updated own profile')
  res.json({ user: { ...safeUser(req.user), name }, message: 'Profile updated.' })
}

export async function changePassword(req, res) {
  const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
  if (!(await bcrypt.compare(req.body.current_password, user.password_hash))) fail('Your current password is incorrect.', 422)
  if (req.body.current_password === req.body.new_password) fail('Choose a password different from the current one.', 422)
  const hash = await bcrypt.hash(req.body.new_password, 12)
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id])
  await auditWithPool(req.user.id, 'PASSWORD_CHANGE', 'USER', req.user.id, 'Changed own password')
  res.json({ message: 'Password updated.' })
}
