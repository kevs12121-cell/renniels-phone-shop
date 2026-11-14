import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { body, param } from 'express-validator'
import { pool, withTransaction } from '../config/db.js'
import { ownerOnly } from '../middleware/auth.js'
import { audit, auditWithPool } from '../utils/audit.js'
import { fail, handle, isDate, localDate, searchFilter, validate, where } from '../utils/http.js'

const router = Router()

// ---------- Reports (owner)
router.get('/reports', ownerOnly, handle(async (req, res) => {
  const to = isDate(req.query.to) ? req.query.to : localDate()
  const from = isDate(req.query.from) ? req.query.from : localDate(new Date(Date.now() - 29 * 86400000))
  if (from > to) fail('The start date must be before the end date.')
  const range = 's.sale_date >= ? AND s.sale_date < DATE_ADD(?, INTERVAL 1 DAY)'
  const live = `s.status <> 'CANCELLED' AND ${range}`
  const values = [from, to]

  const [[sales]] = await pool.query(`SELECT COUNT(*) transactions, COALESCE(SUM(s.total), 0) gross, COALESCE(SUM(s.discount), 0) discounts, COALESCE(AVG(s.total), 0) average FROM sales s WHERE ${live}`, values)
  const [[items]] = await pool.query(`SELECT COALESCE(SUM(si.quantity), 0) quantity, COALESCE(SUM(si.quantity * si.unit_cost), 0) cost, COALESCE(SUM(si.discount), 0) line_discounts FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${live}`, values)
  const [[refunds]] = await pool.query("SELECT COUNT(*) count, COALESCE(SUM(refund_amount), 0) total FROM returns r WHERE r.status IN ('COMPLETED', 'APPROVED') AND r.return_date >= ? AND r.return_date < DATE_ADD(?, INTERVAL 1 DAY)", values)
  const [[restocked]] = await pool.query(`SELECT COALESCE(SUM(ri.quantity * si.unit_cost), 0) cost FROM return_items ri JOIN returns r ON r.id = ri.return_id JOIN sale_items si ON si.id = ri.sale_item_id
    WHERE ri.item_condition = 'GOOD' AND r.status IN ('COMPLETED', 'APPROVED') AND r.return_date >= ? AND r.return_date < DATE_ADD(?, INTERVAL 1 DAY)`, values)
  const [[cancelled]] = await pool.query(`SELECT COUNT(*) count, COALESCE(SUM(s.total), 0) total FROM sales s WHERE s.status = 'CANCELLED' AND ${range}`, values)
  const [[purchases]] = await pool.query('SELECT COUNT(*) count, COALESCE(SUM(total), 0) total FROM purchases WHERE purchase_date BETWEEN ? AND ?', values)

  const [dailyRows] = await pool.query(`SELECT DATE_FORMAT(s.sale_date, '%Y-%m-%d') day, COUNT(*) transactions, SUM(s.total) sales,
      SUM((SELECT COALESCE(SUM(si.quantity * si.unit_cost), 0) FROM sale_items si WHERE si.sale_id = s.id)) cost
    FROM sales s WHERE ${live} GROUP BY day ORDER BY day`, values)
  const daily = []
  const byDay = new Map(dailyRows.map((row) => [row.day, row]))
  for (let cursor = new Date(`${from}T00:00:00Z`); cursor <= new Date(`${to}T00:00:00Z`); cursor = new Date(cursor.getTime() + 86400000)) {
    const day = cursor.toISOString().slice(0, 10)
    const row = byDay.get(day)
    daily.push({ day, transactions: Number(row?.transactions || 0), sales: Number(row?.sales || 0), profit: Number(row ? row.sales - row.cost : 0) })
  }

  const [topProducts] = await pool.query(`SELECT p.id, p.product_code, p.product_name, c.category_name, SUM(si.quantity) quantity, SUM(si.subtotal) revenue, SUM(si.subtotal - si.quantity * si.unit_cost) profit
    FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id JOIN categories c ON c.id = p.category_id
    WHERE ${live} GROUP BY p.id, p.product_code, p.product_name, c.category_name ORDER BY revenue DESC LIMIT 10`, values)
  const [byCategory] = await pool.query(`SELECT c.category_name, SUM(si.quantity) quantity, SUM(si.subtotal) revenue, SUM(si.subtotal - si.quantity * si.unit_cost) profit
    FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id JOIN categories c ON c.id = p.category_id
    WHERE ${live} GROUP BY c.id, c.category_name ORDER BY revenue DESC`, values)
  const [byPayment] = await pool.query(`SELECT pay.payment_method method, COUNT(*) transactions, SUM(pay.amount) total
    FROM payments pay JOIN sales s ON s.id = pay.sale_id WHERE ${live} GROUP BY pay.payment_method ORDER BY total DESC`, values)
  const [byCashier] = await pool.query(`SELECT u.id, u.name, u.role, COUNT(*) transactions, SUM(s.total) total, AVG(s.total) average
    FROM sales s JOIN users u ON u.id = s.processed_by WHERE ${live} GROUP BY u.id, u.name, u.role ORDER BY total DESC`, values)
  const [inventory] = await pool.query(`SELECT p.product_code, p.product_name, c.category_name, p.stock_quantity, p.cost_price, p.selling_price,
      p.stock_quantity * p.cost_price inventory_cost_value, p.stock_quantity * p.selling_price potential_retail_value
    FROM products p JOIN categories c ON c.id = p.category_id WHERE p.status = 'ACTIVE' ORDER BY inventory_cost_value DESC, p.product_name`)

  const netSales = sales.gross - refunds.total
  const netCost = items.cost - restocked.cost
  res.json({
    range: { from, to },
    summary: {
      transactions: sales.transactions,
      grossSales: sales.gross,
      discounts: sales.discounts + items.line_discounts,
      refunds: refunds.total,
      returnsCount: refunds.count,
      netSales,
      costOfGoods: netCost,
      grossProfit: netSales - netCost,
      margin: netSales > 0 ? (netSales - netCost) / netSales : 0,
      averageSale: sales.average,
      itemsSold: items.quantity,
      cancelledCount: cancelled.count,
      cancelledTotal: cancelled.total,
      purchasesCount: purchases.count,
      purchasesTotal: purchases.total
    },
    daily,
    topProducts,
    byCategory,
    byPayment,
    byCashier,
    inventory
  })
}))

// ---------- Users (owner)
router.get('/users', ownerOnly, handle(async (req, res) => {
  const [users] = await pool.query(`SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at, u.created_at,
      (SELECT COUNT(*) FROM sales s WHERE s.processed_by = u.id AND s.status <> 'CANCELLED' AND s.sale_date >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01')) month_transactions,
      (SELECT COALESCE(SUM(total), 0) FROM sales s WHERE s.processed_by = u.id AND s.status <> 'CANCELLED' AND s.sale_date >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01')) month_sales,
      (SELECT COALESCE(SUM(total), 0) FROM sales s WHERE s.processed_by = u.id AND s.status <> 'CANCELLED') lifetime_sales
    FROM users u ORDER BY u.role DESC, u.status, u.name`)
  res.json({ users })
}))

router.post(
  '/users',
  ownerOnly,
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').isEmail().withMessage('Enter a valid email address.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  validate,
  handle(async (req, res) => {
    const hash = await bcrypt.hash(req.body.password, 12)
    const [result] = await pool.query("INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'CASHIER', 'ACTIVE')", [req.body.name.trim(), req.body.email.toLowerCase().trim(), hash])
    await auditWithPool(req.user.id, 'USER_CREATE', 'USER', result.insertId, `Created cashier account for ${req.body.name.trim()}`)
    res.status(201).json({ id: result.insertId, message: 'Cashier account created.' })
  })
)

router.put(
  '/users/:id',
  ownerOnly,
  param('id').isInt(),
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email').isEmail().withMessage('Enter a valid email address.'),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
  validate,
  handle(async (req, res) => {
    const [[target]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id])
    if (!target) fail('User not found.', 404)
    const status = req.body.status || target.status
    if (target.id === req.user.id && status !== 'ACTIVE') fail('You cannot deactivate your own account.')
    if (target.role === 'OWNER' && status !== 'ACTIVE') fail('The owner account cannot be deactivated.')
    await pool.query('UPDATE users SET name = ?, email = ?, status = ? WHERE id = ?', [req.body.name.trim(), req.body.email.toLowerCase().trim(), status, target.id])
    const change = status !== target.status ? ` (${status === 'ACTIVE' ? 'reactivated' : 'deactivated'})` : ''
    await auditWithPool(req.user.id, 'USER_UPDATE', 'USER', target.id, `Updated ${req.body.name.trim()}${change}`)
    res.json({ message: 'User updated.' })
  })
)

router.put('/users/:id/password', ownerOnly, param('id').isInt(), body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'), validate, handle(async (req, res) => {
  const [[target]] = await pool.query('SELECT id, name FROM users WHERE id = ?', [req.params.id])
  if (!target) fail('User not found.', 404)
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(req.body.password, 12), target.id])
  await auditWithPool(req.user.id, 'PASSWORD_RESET', 'USER', target.id, `Reset password for ${target.name}`)
  res.json({ message: `Password reset for ${target.name}.` })
}))

// ---------- Audit logs (owner)
router.get('/audit-logs', ownerOnly, handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['a.description', 'a.action', 'a.entity_type', 'u.name'])
  const filter = where([
    [search.sql, search.values],
    req.query.action && ['a.action = ?', req.query.action],
    req.query.user_id && ['a.user_id = ?', Number(req.query.user_id)],
    isDate(req.query.from) && ['a.created_at >= ?', req.query.from],
    isDate(req.query.to) && ['a.created_at < DATE_ADD(?, INTERVAL 1 DAY)', req.query.to]
  ])
  const [logs] = await pool.query(`SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.description, a.created_at, u.name user_name, u.role user_role
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${filter.sql} ORDER BY a.created_at DESC, a.id DESC LIMIT 1000`, filter.values)
  const [actions] = await pool.query('SELECT DISTINCT action FROM audit_logs ORDER BY action')
  res.json({ logs, actions: actions.map((row) => row.action) })
}))

// ---------- Settings (everyone reads for receipts, owner edits)
const SETTING_KEYS = ['business_name', 'business_address', 'business_phone', 'business_email', 'receipt_footer', 'currency', 'tax_id']

router.get('/settings', handle(async (req, res) => {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings')
  res.json({ settings: Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value])) })
}))

router.put('/settings', ownerOnly, body('business_name').optional().trim().notEmpty().withMessage('Business name cannot be empty.'), validate, handle(async (req, res) => {
  await withTransaction(async (connection) => {
    for (const [key, value] of Object.entries(req.body)) {
      if (!SETTING_KEYS.includes(key)) continue
      await connection.query('INSERT INTO settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)', [key, String(value ?? '').trim(), req.user.id])
    }
    await audit(connection, req.user.id, 'SETTINGS_UPDATE', 'SETTINGS', null, 'Updated business settings')
  })
  res.json({ message: 'Settings saved.' })
}))

export default router
