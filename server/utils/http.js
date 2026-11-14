import { validationResult } from 'express-validator'
import { config } from '../config/env.js'

export function validate(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const first = errors.array()[0]
    return res.status(422).json({ message: first?.msg && first.msg !== 'Invalid value' ? first.msg : `Please check the ${first?.path || 'submitted'} field.`, errors: errors.array() })
  }
  next()
}

export function fail(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}

export const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

/** YYYYMMDD in the shop's timezone, used for invoice / reference numbers. */
export function localDateKey(date = new Date()) {
  return new Date(date.getTime() + config.timezoneOffsetMinutes * 60000).toISOString().slice(0, 10).replaceAll('-', '')
}

/** YYYY-MM-DD in the shop's timezone. */
export function localDate(date = new Date()) {
  return new Date(date.getTime() + config.timezoneOffsetMinutes * 60000).toISOString().slice(0, 10)
}

export function searchFilter(search, fields) {
  const term = String(search || '').trim()
  if (!term) return { sql: '', values: [] }
  return { sql: `(${fields.map((field) => `${field} LIKE ?`).join(' OR ')})`, values: fields.map(() => `%${term}%`) }
}

export function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Builds a WHERE clause from a list of [sql, ...values] conditions, skipping empty ones. */
export function where(conditions) {
  const parts = []
  const values = []
  for (const condition of conditions) {
    if (!condition || !condition[0]) continue
    parts.push(condition[0])
    values.push(...condition.slice(1).flat())
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', values }
}
