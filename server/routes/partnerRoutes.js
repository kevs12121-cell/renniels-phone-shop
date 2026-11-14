import { Router } from 'express'
import { body, param } from 'express-validator'
import { pool } from '../config/db.js'
import { ownerOnly } from '../middleware/auth.js'
import { auditWithPool } from '../utils/audit.js'
import { fail, handle, searchFilter, validate, where } from '../utils/http.js'

const router = Router()
const text = (value) => (value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim())
const optionalEmail = body('email').optional({ values: 'falsy' }).isEmail().withMessage('Enter a valid email address.')

// ---------- Suppliers (owner managed)
router.get('/suppliers', handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['s.supplier_name', 's.contact_person', 's.phone', 's.email'])
  const filter = where([[search.sql, search.values], ['ACTIVE', 'INACTIVE'].includes(req.query.status) && ['s.status = ?', req.query.status]])
  const [rows] = await pool.query(`SELECT s.*,
      (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.status = 'ACTIVE') product_count,
      (SELECT COUNT(*) FROM purchases pu WHERE pu.supplier_id = s.id) purchase_count,
      (SELECT COALESCE(SUM(total), 0) FROM purchases pu WHERE pu.supplier_id = s.id) purchase_total,
      (SELECT MAX(purchase_date) FROM purchases pu WHERE pu.supplier_id = s.id) last_purchase
    FROM suppliers s ${filter.sql} ORDER BY s.status, s.supplier_name`, filter.values)
  res.json({ suppliers: req.user.role === 'OWNER' ? rows : rows.map(({ purchase_total, ...row }) => row) })
}))

router.get('/suppliers/:id', ownerOnly, param('id').isInt(), validate, handle(async (req, res) => {
  const [[supplier]] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [req.params.id])
  if (!supplier) fail('Supplier not found.', 404)
  const [purchases] = await pool.query('SELECT id, reference_number, purchase_date, total, payment_status FROM purchases WHERE supplier_id = ? ORDER BY purchase_date DESC, id DESC LIMIT 20', [req.params.id])
  const [products] = await pool.query("SELECT id, product_code, product_name, stock_quantity, cost_price FROM products WHERE supplier_id = ? AND status = 'ACTIVE' ORDER BY product_name", [req.params.id])
  res.json({ supplier, purchases, products })
}))

const supplierFields = [body('supplier_name').trim().notEmpty().withMessage('Supplier name is required.'), optionalEmail, body('status').optional().isIn(['ACTIVE', 'INACTIVE'])]
const supplierValues = (input) => ({
  supplier_name: String(input.supplier_name).trim(),
  contact_person: text(input.contact_person),
  phone: text(input.phone),
  email: text(input.email),
  address: text(input.address),
  notes: text(input.notes),
  status: input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
})

router.post('/suppliers', ownerOnly, supplierFields, validate, handle(async (req, res) => {
  const values = supplierValues(req.body)
  const [result] = await pool.query('INSERT INTO suppliers SET ?', [values])
  await auditWithPool(req.user.id, 'CREATE', 'SUPPLIER', result.insertId, `Created supplier ${values.supplier_name}`)
  res.status(201).json({ id: result.insertId, message: 'Supplier created.' })
}))

router.put('/suppliers/:id', ownerOnly, param('id').isInt(), supplierFields, validate, handle(async (req, res) => {
  const values = supplierValues(req.body)
  const [result] = await pool.query('UPDATE suppliers SET ? WHERE id = ?', [values, req.params.id])
  if (!result.affectedRows) fail('Supplier not found.', 404)
  await auditWithPool(req.user.id, 'UPDATE', 'SUPPLIER', req.params.id, `Updated supplier ${values.supplier_name}`)
  res.json({ message: 'Supplier updated.' })
}))

// ---------- Customers (owner and cashier)
router.get('/customers', handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['c.customer_code', 'c.full_name', 'c.phone', 'c.email'])
  const filter = where([[search.sql, search.values], ['ACTIVE', 'INACTIVE'].includes(req.query.status) && ['c.status = ?', req.query.status]])
  const [rows] = await pool.query(`SELECT c.*, COALESCE(st.purchases, 0) purchases, COALESCE(st.total_spent, 0) total_spent, st.last_purchase
    FROM customers c
    LEFT JOIN (SELECT customer_id, COUNT(*) purchases, SUM(total) total_spent, MAX(sale_date) last_purchase FROM sales WHERE status <> 'CANCELLED' GROUP BY customer_id) st ON st.customer_id = c.id
    ${filter.sql} ORDER BY c.full_name`, filter.values)
  res.json({ customers: rows })
}))

router.get('/customers/:id', param('id').isInt(), validate, handle(async (req, res) => {
  const [[customer]] = await pool.query('SELECT * FROM customers WHERE id = ?', [req.params.id])
  if (!customer) fail('Customer not found.', 404)
  const [sales] = await pool.query(`SELECT s.id, s.invoice_number, s.sale_date, s.total, s.status, u.name cashier,
      (SELECT GROUP_CONCAT(p.product_name ORDER BY si.id SEPARATOR ', ') FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) items
    FROM sales s LEFT JOIN users u ON u.id = s.processed_by WHERE s.customer_id = ? ORDER BY s.sale_date DESC LIMIT 50`, [req.params.id])
  const [[stats]] = await pool.query("SELECT COUNT(*) purchases, COALESCE(SUM(total), 0) total_spent FROM sales WHERE customer_id = ? AND status <> 'CANCELLED'", [req.params.id])
  res.json({ customer: { ...customer, ...stats }, sales })
}))

const customerFields = [body('full_name').trim().notEmpty().withMessage('Customer name is required.'), optionalEmail, body('status').optional().isIn(['ACTIVE', 'INACTIVE'])]
const customerValues = (input) => ({
  full_name: String(input.full_name).trim(),
  phone: text(input.phone),
  email: text(input.email),
  address: text(input.address),
  notes: text(input.notes),
  status: input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
})

router.post('/customers', customerFields, validate, handle(async (req, res) => {
  const values = customerValues(req.body)
  const [result] = await pool.query('INSERT INTO customers SET ?', [{ ...values, customer_code: `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}` }])
  const code = `CUS-${String(result.insertId).padStart(4, '0')}`
  await pool.query('UPDATE customers SET customer_code = ? WHERE id = ?', [code, result.insertId]).catch(() =>
    pool.query('UPDATE customers SET customer_code = ? WHERE id = ?', [`CUS-${result.insertId}-${Date.now() % 10000}`, result.insertId])
  )
  await auditWithPool(req.user.id, 'CREATE', 'CUSTOMER', result.insertId, `Created customer ${values.full_name}`)
  res.status(201).json({ id: result.insertId, customer_code: code, full_name: values.full_name, message: 'Customer created.' })
}))

router.put('/customers/:id', param('id').isInt(), customerFields, validate, handle(async (req, res) => {
  const values = customerValues(req.body)
  const [result] = await pool.query('UPDATE customers SET ? WHERE id = ?', [values, req.params.id])
  if (!result.affectedRows) fail('Customer not found.', 404)
  await auditWithPool(req.user.id, 'UPDATE', 'CUSTOMER', req.params.id, `Updated customer ${values.full_name}`)
  res.json({ message: 'Customer updated.' })
}))

export default router
