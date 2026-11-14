import { Router } from 'express'
import { body, param } from 'express-validator'
import { pool, withTransaction } from '../config/db.js'
import { ownerOnly } from '../middleware/auth.js'
import { audit } from '../utils/audit.js'
import { fail, handle, isDate, localDate, localDateKey, round2, searchFilter, validate, where } from '../utils/http.js'

const router = Router()

// ---------- Stock overview
router.get('/inventory', handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['p.product_code', 'p.product_name', 'p.brand', 'c.category_name'])
  const status = { LOW: 'p.stock_quantity > 0 AND p.stock_quantity <= p.reorder_level', OUT: 'p.stock_quantity <= 0', IN: 'p.stock_quantity > p.reorder_level' }[req.query.status]
  const filter = where([["p.status = 'ACTIVE'"], [search.sql, search.values], status && [status], req.query.category_id && ['p.category_id = ?', Number(req.query.category_id)]])
  const [rows] = await pool.query(`SELECT p.id, p.product_code, p.product_name, p.brand, p.is_serialized, p.stock_quantity, p.reorder_level, p.cost_price, p.selling_price,
      c.category_name, s.supplier_name,
      p.stock_quantity * p.cost_price cost_value, p.stock_quantity * p.selling_price retail_value,
      (SELECT MAX(l.created_at) FROM inventory_logs l WHERE l.product_id = p.id) last_movement,
      CASE WHEN p.stock_quantity <= 0 THEN 'OUT OF STOCK' WHEN p.stock_quantity <= p.reorder_level THEN 'LOW STOCK' ELSE 'IN STOCK' END stock_status
    FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN suppliers s ON s.id = p.supplier_id
    ${filter.sql}
    ORDER BY (p.stock_quantity <= p.reorder_level) DESC, p.stock_quantity ASC, p.product_name`, filter.values)
  const inventory = req.user.role === 'OWNER' ? rows : rows.map(({ cost_price, cost_value, ...row }) => row)
  res.json({ inventory })
}))

router.get('/inventory/logs', handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['p.product_name', 'p.product_code', 'l.remarks'])
  const filter = where([
    [search.sql, search.values],
    req.query.type && ['l.movement_type = ?', req.query.type],
    req.query.product_id && ['l.product_id = ?', Number(req.query.product_id)],
    isDate(req.query.from) && ['l.created_at >= ?', req.query.from],
    isDate(req.query.to) && ['l.created_at < DATE_ADD(?, INTERVAL 1 DAY)', req.query.to]
  ])
  const [logs] = await pool.query(`SELECT l.*, p.product_name, p.product_code, u.name performed_by, pu.imei, pu.serial_number
    FROM inventory_logs l JOIN products p ON p.id = l.product_id LEFT JOIN users u ON u.id = l.created_by LEFT JOIN product_units pu ON pu.id = l.product_unit_id
    ${filter.sql} ORDER BY l.created_at DESC, l.id DESC LIMIT 1000`, filter.values)
  res.json({ logs })
}))

router.post(
  '/inventory/adjust',
  ownerOnly,
  body('product_id').isInt({ min: 1 }).withMessage('Choose a product.'),
  body('direction').isIn(['INCREASE', 'DECREASE']).withMessage('Choose increase or decrease.'),
  body('movement_type').optional().isIn(['ADJUSTMENT', 'DAMAGE']),
  body('remarks').trim().notEmpty().withMessage('Explain the reason for this adjustment.'),
  validate,
  handle(async (req, res) => {
    const result = await withTransaction(async (connection) => {
      const [[product]] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [req.body.product_id])
      if (!product) fail('Product not found.', 404)
      const type = req.body.movement_type === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT'
      let change
      let unitId = null

      if (product.is_serialized) {
        // Serialized stock always moves one identified unit at a time so units and counts stay in sync.
        unitId = Number(req.body.product_unit_id)
        if (!unitId) fail('Select the IMEI / serial unit to adjust.')
        const [[unit]] = await connection.query('SELECT * FROM product_units WHERE id = ? AND product_id = ? FOR UPDATE', [unitId, product.id])
        if (!unit) fail('Unit not found for this product.', 404)
        if (req.body.direction === 'DECREASE') {
          if (unit.unit_status !== 'IN_STOCK') fail('Only in-stock units can be removed from stock.')
          const nextStatus = ['DAMAGED', 'DEFECTIVE', 'RESERVED'].includes(req.body.unit_status) ? req.body.unit_status : type === 'DAMAGE' ? 'DAMAGED' : 'DEFECTIVE'
          await connection.query('UPDATE product_units SET unit_status = ? WHERE id = ?', [nextStatus, unitId])
          change = -1
        } else {
          if (!['DAMAGED', 'DEFECTIVE', 'RETURNED', 'RESERVED'].includes(unit.unit_status)) fail('Only damaged, defective, returned or reserved units can be restored to stock.')
          await connection.query("UPDATE product_units SET unit_status = 'IN_STOCK', sale_reference = NULL WHERE id = ?", [unitId])
          change = 1
        }
      } else {
        const quantity = Number(req.body.quantity)
        if (!Number.isInteger(quantity) || quantity <= 0) fail('Quantity must be a whole number greater than zero.')
        change = req.body.direction === 'DECREASE' ? -quantity : quantity
      }

      const next = Number(product.stock_quantity) + change
      if (next < 0) fail(`Cannot remove ${Math.abs(change)}; only ${product.stock_quantity} in stock.`)
      await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, product.id])
      await connection.query(
        "INSERT INTO inventory_logs (product_id, product_unit_id, movement_type, quantity, previous_quantity, new_quantity, reference_type, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)",
        [product.id, unitId, type, change, product.stock_quantity, next, req.body.remarks.trim(), req.user.id]
      )
      await audit(connection, req.user.id, 'INVENTORY_ADJUSTMENT', 'PRODUCT', product.id, `${req.body.remarks.trim()} (${product.product_name}, ${change > 0 ? '+' : ''}${change})`)
      return { stock_quantity: next }
    })
    res.json({ message: 'Inventory adjusted.', ...result })
  })
)

// ---------- Purchases / receiving (owner only)
router.get('/purchases', ownerOnly, handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['pu.reference_number', 's.supplier_name', 'pu.notes'])
  const filter = where([
    [search.sql, search.values],
    req.query.supplier_id && ['pu.supplier_id = ?', Number(req.query.supplier_id)],
    ['UNPAID', 'PARTIAL', 'PAID'].includes(req.query.payment_status) && ['pu.payment_status = ?', req.query.payment_status],
    isDate(req.query.from) && ['pu.purchase_date >= ?', req.query.from],
    isDate(req.query.to) && ['pu.purchase_date <= ?', req.query.to]
  ])
  const [purchases] = await pool.query(`SELECT pu.*, s.supplier_name, u.name created_by_name,
      (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = pu.id) item_count,
      (SELECT COALESCE(SUM(quantity), 0) FROM purchase_items pi WHERE pi.purchase_id = pu.id) total_quantity
    FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id LEFT JOIN users u ON u.id = pu.created_by
    ${filter.sql} ORDER BY pu.purchase_date DESC, pu.id DESC`, filter.values)
  res.json({ purchases })
}))

router.get('/purchases/:id', ownerOnly, param('id').isInt(), validate, handle(async (req, res) => {
  const [[purchase]] = await pool.query('SELECT pu.*, s.supplier_name, s.contact_person, s.phone supplier_phone, u.name created_by_name FROM purchases pu JOIN suppliers s ON s.id = pu.supplier_id LEFT JOIN users u ON u.id = pu.created_by WHERE pu.id = ?', [req.params.id])
  if (!purchase) fail('Purchase not found.', 404)
  const [items] = await pool.query('SELECT pi.*, p.product_code, p.product_name, p.is_serialized FROM purchase_items pi JOIN products p ON p.id = pi.product_id WHERE pi.purchase_id = ? ORDER BY pi.id', [req.params.id])
  const [units] = await pool.query('SELECT id, product_id, imei, imei2, serial_number, unit_status FROM product_units WHERE purchase_reference = ? ORDER BY id', [purchase.reference_number])
  res.json({ purchase, items: items.map((item) => ({ ...item, units: units.filter((unit) => unit.product_id === item.product_id) })) })
}))

router.post(
  '/purchases',
  ownerOnly,
  body('supplier_id').isInt({ min: 1 }).withMessage('Choose a supplier.'),
  body('purchase_date').optional({ values: 'falsy' }).isISO8601().withMessage('Enter a valid purchase date.'),
  body('payment_status').optional().isIn(['UNPAID', 'PARTIAL', 'PAID']),
  body('discount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('items').isArray({ min: 1 }).withMessage('Add at least one product to receive.'),
  validate,
  handle(async (req, res) => {
    const result = await withTransaction(async (connection) => {
      const [[supplier]] = await connection.query('SELECT * FROM suppliers WHERE id = ?', [req.body.supplier_id])
      if (!supplier) fail('Supplier not found.', 404)
      const purchaseDate = isDate(req.body.purchase_date) ? req.body.purchase_date : localDate()

      const lines = []
      const seenIdentifiers = new Set()
      for (const raw of req.body.items) {
        const [[product]] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [raw.product_id])
        if (!product) fail('A product in this purchase no longer exists.')
        const quantity = Number(raw.quantity)
        const unitCost = round2(raw.unit_cost)
        if (!Number.isInteger(quantity) || quantity <= 0) fail(`Enter a whole-number quantity for ${product.product_name}.`)
        if (!(unitCost >= 0)) fail(`Enter a valid unit cost for ${product.product_name}.`)
        let identifiers = []
        if (product.is_serialized) {
          identifiers = (Array.isArray(raw.identifiers) ? raw.identifiers : String(raw.identifiers || '').split(/[\s,]+/)).map((value) => String(value).trim()).filter(Boolean)
          if (identifiers.length !== quantity) fail(`${product.product_name} needs exactly ${quantity} IMEI/serial number${quantity > 1 ? 's' : ''} (got ${identifiers.length}).`)
          for (const identifier of identifiers) {
            if (seenIdentifiers.has(identifier)) fail(`IMEI/serial ${identifier} is listed twice.`)
            seenIdentifiers.add(identifier)
          }
          const [existing] = await connection.query('SELECT imei, imei2, serial_number FROM product_units WHERE imei IN (?) OR imei2 IN (?) OR serial_number IN (?) LIMIT 1', [identifiers, identifiers, identifiers])
          if (existing.length) fail(`IMEI/serial ${existing[0].imei || existing[0].serial_number || existing[0].imei2} already exists in inventory.`)
        }
        lines.push({ product, quantity, unitCost, identifiers })
      }

      const subtotal = round2(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0))
      const discount = round2(req.body.discount || 0)
      if (discount > subtotal) fail('Discount cannot be greater than the purchase subtotal.')
      const [insert] = await connection.query(
        'INSERT INTO purchases (supplier_id, reference_number, purchase_date, subtotal, discount, total, payment_status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [supplier.id, `TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, purchaseDate, subtotal, discount, round2(subtotal - discount), req.body.payment_status || 'UNPAID', req.body.notes || null, req.user.id]
      )
      const purchaseId = insert.insertId
      const reference = String(req.body.reference_number || '').trim() || `PO-${localDateKey()}-${String(purchaseId).padStart(4, '0')}`
      await connection.query('UPDATE purchases SET reference_number = ? WHERE id = ?', [reference, purchaseId])

      for (const line of lines) {
        await connection.query('INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, subtotal) VALUES (?, ?, ?, ?, ?)', [purchaseId, line.product.id, line.quantity, line.unitCost, round2(line.quantity * line.unitCost)])
        for (const identifier of line.identifiers) {
          const isImei = /^\d{14,16}$/.test(identifier)
          await connection.query(
            "INSERT INTO product_units (product_id, imei, serial_number, unit_status, cost_price, selling_price, purchase_reference) VALUES (?, ?, ?, 'IN_STOCK', ?, ?, ?)",
            [line.product.id, isImei ? identifier : null, isImei ? null : identifier, line.unitCost, line.product.selling_price, reference]
          )
        }
        const [[fresh]] = await connection.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [line.product.id])
        const next = Number(fresh.stock_quantity) + line.quantity
        await connection.query('UPDATE products SET stock_quantity = ?, cost_price = ?, supplier_id = COALESCE(supplier_id, ?) WHERE id = ?', [next, line.unitCost, supplier.id, line.product.id])
        await connection.query(
          "INSERT INTO inventory_logs (product_id, movement_type, quantity, previous_quantity, new_quantity, reference_type, reference_id, remarks, created_by) VALUES (?, 'PURCHASE', ?, ?, ?, 'PURCHASE', ?, ?, ?)",
          [line.product.id, line.quantity, fresh.stock_quantity, next, purchaseId, `Received via ${reference}`, req.user.id]
        )
      }
      await audit(connection, req.user.id, 'PURCHASE_CREATE', 'PURCHASE', purchaseId, `Received ${reference} from ${supplier.supplier_name} (${lines.length} item${lines.length > 1 ? 's' : ''})`)
      return { id: purchaseId, reference_number: reference }
    })
    res.status(201).json({ ...result, message: 'Purchase received and stock updated.' })
  })
)

router.put('/purchases/:id/payment', ownerOnly, param('id').isInt(), body('payment_status').isIn(['UNPAID', 'PARTIAL', 'PAID']), validate, handle(async (req, res) => {
  const [result] = await pool.query('UPDATE purchases SET payment_status = ? WHERE id = ?', [req.body.payment_status, req.params.id])
  if (!result.affectedRows) fail('Purchase not found.', 404)
  await audit(pool, req.user.id, 'PURCHASE_PAYMENT', 'PURCHASE', req.params.id, `Marked purchase #${req.params.id} as ${req.body.payment_status}`)
  res.json({ message: 'Payment status updated.' })
}))

export default router
