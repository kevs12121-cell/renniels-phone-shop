const pesoFormatter = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const numberFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })

export function money(value) {
  const amount = Number(value || 0)
  return `${amount < 0 ? '-' : ''}₱${pesoFormatter.format(Math.abs(amount))}`
}

/** Compact peso amounts for stat tiles and axes: ₱9,990 · ₱48.5K · ₱1.2M */
export function moneyShort(value) {
  const amount = Number(value || 0)
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}₱${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`
  if (abs >= 1e4) return `${sign}₱${(abs / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  return `${sign}₱${numberFormatter.format(Math.round(abs))}`
}

export function number(value) {
  return numberFormatter.format(Number(value || 0))
}

export function percent(value, digits = 1) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`
}

export function date(value) {
  if (!value) return '—'
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function dateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function time(value) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

export function dayLabel(isoDay, options = { month: 'short', day: 'numeric' }) {
  return new Date(`${isoDay}T00:00:00`).toLocaleDateString('en-PH', options)
}

export function relativeTime(value) {
  if (!value) return 'Never'
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`
  return date(value)
}

/** YYYY-MM-DD in the browser's local time. */
export function isoDay(offsetDays = 0) {
  const now = new Date()
  now.setDate(now.getDate() + offsetDays)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const PAYMENT_LABELS = { CASH: 'Cash', GCASH: 'GCash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer', OTHER: 'Other (Maya)' }
export const ROLE_LABELS = { OWNER: 'Owner', CASHIER: 'Cashier' }
export const MOVEMENT_LABELS = { PURCHASE: 'Purchase', SALE: 'Sale', RETURN: 'Return', CANCELLATION: 'Cancellation', ADJUSTMENT: 'Adjustment', DAMAGE: 'Damage', TRANSFER: 'Transfer' }

export function titleCase(value) {
  if (!value) return '—'
  return String(value).toLowerCase().replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase())
}

export function unitIdentifier(unit) {
  if (!unit) return ''
  return unit.imei ? `IMEI ${unit.imei}` : unit.serial_number ? `S/N ${unit.serial_number}` : `Unit #${unit.id}`
}

export function downloadCsv(filename, columns, rows) {
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const lines = [columns.map(([, label]) => escape(label)).join(','), ...rows.map((row) => columns.map(([key]) => escape(typeof key === 'function' ? key(row) : row[key])).join(','))]
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
