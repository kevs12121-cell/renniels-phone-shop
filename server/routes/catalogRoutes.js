import { Router } from 'express'
import { body, param } from 'express-validator'
import { pool } from '../config/db.js'
import { ownerOnly } from '../middleware/auth.js'
import { auditWithPool } from '../utils/audit.js'
import { fail, handle, searchFilter, validate, where } from '../utils/http.js'

const router = Router()

/** Cashiers never receive cost or margin data. */
export function hideCost(req, row) {
  if (req.user.role === 'OWNER' || !row) return row
  const { cost_price, ...rest } = row
  return rest
}

const productFields = [
  body('product_code').trim().notEmpty().withMessage('Product code (SKU) is required.'),
  body('product_name').trim().notEmpty().withMessage('Product name is required.'),
  body('category_id').isInt({ min: 1 }).withMessage('Choose a category.'),
  body('supplier_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('cost_price').isFloat({ min: 0 }).withMessage('Cost price must be zero or more.'),
  body('selling_price').isFloat({ min: 0 }).withMessage('Selling price must be zero or more.'),
  body('reorder_level').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Reorder level must be zero or more.'),
  body('status').optional().isIn(['ACTIVE', 'INACTIVE'])
]

function productValues(input) {
  const text = (value) => (value === undefined || value === null || String(value).trim() === '' ? null : String(value).trim())
  return {
    product_code: String(input.product_code).trim().toUpperCase(),
    product_name: String(input.product_name).trim(),
    category_id: Number(input.category_id),
    supplier_id: input.supplier_id ? Number(input.supplier_id) : null,
    brand: text(input.brand),
    model: text(input.model),
    variant: text(input.variant),
    storage: text(input.storage),
    ram: text(input.ram),
    color: text(input.color),
    description: text(input.description),
    unit: text(input.unit) || 'piece',
    is_serialized: Boolean(input.is_serialized),
    cost_price: Number(input.cost_price),
    selling_price: Number(input.selling_price),
    reorder_level: Number(input.reorder_level || 0),
    status: input.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
  }
}

router.get('/products', handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['p.product_code', 'p.product_name', 'p.brand', 'p.model', 'c.category_name'])
  const stockFilter = { LOW: 'p.stock_quantity > 0 AND p.stock_quantity <= p.reorder_level', OUT: 'p.stock_quantity <= 0', IN: 'p.stock_quantity > p.reorder_level' }[req.query.stock]
  const filter = where([
    [search.sql, search.values],
    req.query.category_id && ['p.category_id = ?', Number(req.query.category_id)],
    ['ACTIVE', 'INACTIVE'].includes(req.query.status) && ['p.status = ?', req.query.status],
    req.query.available === '1' && ["p.status = 'ACTIVE' AND p.stock_quantity > 0"],
    stockFilter && [stockFilter]
  ])
  const [rows] = await pool.query(`SELECT p.*, c.category_name, s.supplier_name,
      (SELECT COUNT(*) FROM product_units u WHERE u.product_id = p.id AND u.unit_status = 'IN_STOCK') units_in_stock
    FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN suppliers s ON s.id = p.supplier_id
    ${filter.sql} ORDER BY p.product_name`, filter.values)
  res.json({ products: rows.map((row) => hideCost(req, row)) })
}))

router.get('/products/:id', param('id').isInt(), validate, handle(async (req, res) => {
  const [[product]] = await pool.query('SELECT p.*, c.category_name, s.supplier_name FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?', [req.params.id])
  if (!product) fail('Product not found.', 404)
  const [units] = await pool.query('SELECT * FROM product_units WHERE product_id = ? ORDER BY FIELD(unit_status, \'IN_STOCK\', \'RESERVED\', \'DEFECTIVE\', \'DAMAGED\', \'RETURNED\', \'SOLD\'), created_at DESC', [req.params.id])
  const [movements] = await pool.query('SELECT l.*, u.name performed_by FROM inventory_logs l LEFT JOIN users u ON u.id = l.created_by WHERE l.product_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 25', [req.params.id])
  const [[sales]] = await pool.query("SELECT COALESCE(SUM(si.quantity), 0) sold_30d, COALESCE(SUM(si.subtotal), 0) revenue_30d FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.product_id = ? AND s.status <> 'CANCELLED' AND s.sale_date >= CURRENT_DATE() - INTERVAL 29 DAY", [req.params.id])
  res.json({ product: hideCost(req, { ...product, ...sales }), units: units.map((unit) => hideCost(req, unit)), movements })
}))

router.get('/products/:id/units', param('id').isInt(), validate, handle(async (req, res) => {
  const status = req.query.status ? String(req.query.status).split(',') : ['IN_STOCK']
  const [units] = await pool.query('SELECT id, product_id, imei, imei2, serial_number, unit_status, selling_price, cost_price, purchase_reference, created_at FROM product_units WHERE product_id = ? AND unit_status IN (?) ORDER BY created_at, id', [req.params.id, status])
  res.json({ units: units.map((unit) => hideCost(req, unit)) })
}))

router.post('/products', ownerOnly, productFields, validate, handle(async (req, res) => {
  const values = productValues(req.body)
  const [result] = await pool.query('INSERT INTO products SET ?', [values])
  await auditWithPool(req.user.id, 'CREATE', 'PRODUCT', result.insertId, `Created product ${values.product_name}`)
  res.status(201).json({ id: result.insertId, message: 'Product created.' })
}))

router.put('/products/:id', ownerOnly, param('id').isInt(), productFields, validate, handle(async (req, res) => {
  const [[current]] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id])
  if (!current) fail('Product not found.', 404)
  const values = productValues(req.body)
  if (Boolean(current.is_serialized) !== values.is_serialized && Number(current.stock_quantity) !== 0) {
    fail('IMEI/serial tracking can only be changed while the product has no stock.')
  }
  await pool.query('UPDATE products SET ? WHERE id = ?', [values, req.params.id])
  if (Number(current.selling_price) !== values.selling_price) {
    await pool.query("UPDATE product_units SET selling_price = ? WHERE product_id = ? AND unit_status = 'IN_STOCK'", [values.selling_price, req.params.id])
  }
  await auditWithPool(req.user.id, 'UPDATE', 'PRODUCT', req.params.id, `Updated product ${values.product_name}`)
  res.json({ message: 'Product updated.' })
}))

router.get('/categories', handle(async (req, res) => {
  const [rows] = await pool.query(`SELECT c.*, COUNT(p.id) product_count,
      COALESCE(SUM(p.status = 'ACTIVE'), 0) active_products,
      COALESCE(SUM(CASE WHEN p.status = 'ACTIVE' THEN p.stock_quantity ELSE 0 END), 0) units_on_hand,
      COALESCE(SUM(CASE WHEN p.status = 'ACTIVE' THEN p.stock_quantity * p.selling_price ELSE 0 END), 0) retail_value
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.category_name`)
  res.json({ categories: rows })
}))

const categoryFields = [body('category_name').trim().notEmpty().withMessage('Category name is required.'), body('status').optional().isIn(['ACTIVE', 'INACTIVE'])]

router.post('/categories', ownerOnly, categoryFields, validate, handle(async (req, res) => {
  const [result] = await pool.query('INSERT INTO categories (category_name, description, status) VALUES (?, ?, ?)', [req.body.category_name.trim(), req.body.description || null, req.body.status || 'ACTIVE'])
  await auditWithPool(req.user.id, 'CREATE', 'CATEGORY', result.insertId, `Created category ${req.body.category_name}`)
  res.status(201).json({ id: result.insertId, message: 'Category created.' })
}))

router.put('/categories/:id', ownerOnly, param('id').isInt(), categoryFields, validate, handle(async (req, res) => {
  const [result] = await pool.query('UPDATE categories SET category_name = ?, description = ?, status = ? WHERE id = ?', [req.body.category_name.trim(), req.body.description || null, req.body.status || 'ACTIVE', req.params.id])
  if (!result.affectedRows) fail('Category not found.', 404)
  await auditWithPool(req.user.id, 'UPDATE', 'CATEGORY', req.params.id, `Updated category ${req.body.category_name}`)
  res.json({ message: 'Category updated.' })
}))

export default router
