import { Router } from 'express'
import { body, param } from 'express-validator'
import { pool, withTransaction } from '../config/db.js'
import { ownerOnly } from '../middleware/auth.js'
import { audit } from '../utils/audit.js'
import { fail, handle, isDate, localDateKey, round2, searchFilter, validate, where } from '../utils/http.js'

const router = Router()
const PAYMENT_METHODS = ['CASH', 'GCASH', 'BANK_TRANSFER', 'CARD', 'OTHER']
const CASHIER_DISCOUNT_LIMIT = 0.1

// ---------- Sales history
router.get('/sales', handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['s.invoice_number', 'c.full_name', 'u.name'])
  const filter = where([
    [search.sql, search.values],
    ['COMPLETED', 'CANCELLED', 'RETURNED'].includes(req.query.status) && ['s.status = ?', req.query.status],
    isDate(req.query.from) && ['s.sale_date >= ?', req.query.from],
    isDate(req.query.to) && ['s.sale_date < DATE_ADD(?, INTERVAL 1 DAY)', req.query.to],
    req.query.cashier_id && ['s.processed_by = ?', Number(req.query.cashier_id)],
    req.query.mine === '1' && ['s.processed_by = ?', req.user.id],
    req.query.customer_id && ['s.customer_id = ?', Number(req.query.customer_id)],
    PAYMENT_METHODS.includes(req.query.payment_method) && ['EXISTS (SELECT 1 FROM payments px WHERE px.sale_id = s.id AND px.payment_method = ?)', req.query.payment_method]
  ])
  const [sales] = await pool.query(`SELECT s.id, s.invoice_number, s.sale_date, s.subtotal, s.discount, s.total, s.payment_status, s.status, s.customer_id, s.processed_by,
      COALESCE(c.full_name, 'Walk-in Customer') customer, u.name cashier,
      (SELECT payment_method FROM payments WHERE sale_id = s.id ORDER BY id LIMIT 1) payment_method,
      (SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_id = s.id) item_count,
      (SELECT COALESCE(SUM(refund_amount), 0) FROM returns WHERE sale_id = s.id AND status IN ('COMPLETED', 'APPROVED')) refunded
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.processed_by
    ${filter.sql} ORDER BY s.sale_date DESC, s.id DESC LIMIT 2000`, filter.values)
  res.json({ sales })
}))

router.get('/sales/:id', param('id').isInt(), validate, handle(async (req, res) => {
  const [[sale]] = await pool.query(`SELECT s.*, COALESCE(c.full_name, 'Walk-in Customer') customer, c.customer_code, c.phone customer_phone, u.name cashier, cu.name cancelled_by_name
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.processed_by LEFT JOIN users cu ON cu.id = s.cancelled_by WHERE s.id = ?`, [req.params.id])
  if (!sale) fail('Sale not found.', 404)
  const [items] = await pool.query(`SELECT si.*, p.product_code, p.product_name, p.is_serialized, pu.imei, pu.imei2, pu.serial_number, pu.warranty_until,
      (SELECT COALESCE(SUM(ri.quantity), 0) FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE ri.sale_item_id = si.id AND r.status IN ('COMPLETED', 'APPROVED')) returned_quantity
    FROM sale_items si JOIN products p ON p.id = si.product_id LEFT JOIN product_units pu ON pu.id = si.product_unit_id WHERE si.sale_id = ? ORDER BY si.id`, [req.params.id])
  const [payments] = await pool.query('SELECT * FROM payments WHERE sale_id = ? ORDER BY id', [req.params.id])
  const [returns] = await pool.query('SELECT r.*, u.name processed_by_name FROM returns r LEFT JOIN users u ON u.id = r.processed_by WHERE r.sale_id = ? ORDER BY r.return_date', [req.params.id])
  const isOwner = req.user.role === 'OWNER'
  res.json({ sale, items: isOwner ? items : items.map(({ unit_cost, ...item }) => item), payments, returns })
}))

// ---------- POS checkout
router.post(
  '/sales',
  body('items').isArray({ min: 1 }).withMessage('Add at least one item to the cart.'),
  body('payment_method').isIn(PAYMENT_METHODS).withMessage('Choose a payment method.'),
  body('discount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Discount must be zero or more.'),
  body('customer_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
  validate,
  handle(async (req, res) => {
    const result = await withTransaction(async (connection) => {
      const lines = []
      const usedUnits = new Set()
      for (const raw of req.body.items) {
        const [[product]] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [raw.product_id])
        if (!product || product.status !== 'ACTIVE') fail('A product in the cart is no longer available.')
        const lineDiscount = round2(raw.discount || 0)
        if (product.is_serialized) {
          const unitId = Number(raw.product_unit_id)
          if (!unitId) fail(`Select the IMEI / serial number for ${product.product_name}.`)
          if (usedUnits.has(unitId)) fail(`The same ${product.product_name} unit was added twice.`)
          usedUnits.add(unitId)
          const [[unit]] = await connection.query('SELECT * FROM product_units WHERE id = ? FOR UPDATE', [unitId])
          if (!unit || unit.product_id !== product.id || unit.unit_status !== 'IN_STOCK') fail(`The selected ${product.product_name} unit is no longer in stock.`)
          lines.push({ product, unit, quantity: 1, unitPrice: Number(unit.selling_price) || Number(product.selling_price), unitCost: Number(unit.cost_price) || Number(product.cost_price), discount: lineDiscount })
        } else {
          const quantity = Number(raw.quantity)
          if (!Number.isInteger(quantity) || quantity <= 0) fail(`Enter a whole-number quantity for ${product.product_name}.`)
          lines.push({ product, unit: null, quantity, unitPrice: Number(product.selling_price), unitCost: Number(product.cost_price), discount: lineDiscount })
        }
      }

      const demand = new Map()
      for (const line of lines) demand.set(line.product.id, (demand.get(line.product.id) || 0) + line.quantity)
      for (const line of lines) {
        if (demand.get(line.product.id) > Number(line.product.stock_quantity)) fail(`Only ${Number(line.product.stock_quantity)} left of ${line.product.product_name}.`)
        if (line.discount > line.quantity * line.unitPrice) fail(`Discount on ${line.product.product_name} is larger than its price.`)
      }

      const subtotal = round2(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice - line.discount, 0))
      const discount = round2(req.body.discount || 0)
      if (discount > subtotal) fail('Discount cannot be larger than the subtotal.')
      const totalDiscount = discount + lines.reduce((sum, line) => sum + line.discount, 0)
      if (req.user.role !== 'OWNER' && totalDiscount > round2((subtotal + totalDiscount - discount) * CASHIER_DISCOUNT_LIMIT)) {
        fail(`Cashiers can give at most ${CASHIER_DISCOUNT_LIMIT * 100}% discount. Ask the owner for larger discounts.`, 403)
      }
      const total = round2(subtotal - discount)
      const method = req.body.payment_method
      const tendered = method === 'CASH' ? round2(req.body.amount_tendered ?? total) : total
      if (method === 'CASH' && tendered < total) fail('Cash received is less than the total due.')
      if (method !== 'CASH' && method !== 'OTHER' && !String(req.body.reference_number || '').trim()) fail('Enter the payment reference number.')

      let customerId = req.body.customer_id ? Number(req.body.customer_id) : null
      if (customerId) {
        const [[customer]] = await connection.query("SELECT id FROM customers WHERE id = ? AND status = 'ACTIVE'", [customerId])
        if (!customer) fail('Selected customer is not active.')
      }

      const [insert] = await connection.query(
        "INSERT INTO sales (invoice_number, customer_id, processed_by, sale_date, subtotal, discount, total, amount_tendered, change_due, payment_status, status, notes) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, 'PAID', 'COMPLETED', ?)",
        [`TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, customerId, req.user.id, subtotal, discount, total, tendered, round2(tendered - total), req.body.notes || null]
      )
      const saleId = insert.insertId
      const invoice = `INV-${localDateKey()}-${String(saleId).padStart(5, '0')}`
      await connection.query('UPDATE sales SET invoice_number = ? WHERE id = ?', [invoice, saleId])

      for (const line of lines) {
        await connection.query(
          'INSERT INTO sale_items (sale_id, product_id, product_unit_id, quantity, unit_price, unit_cost, discount, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [saleId, line.product.id, line.unit?.id ?? null, line.quantity, line.unitPrice, line.unitCost, line.discount, round2(line.quantity * line.unitPrice - line.discount)]
        )
        if (line.unit) {
          await connection.query("UPDATE product_units SET unit_status = 'SOLD', sale_reference = ?, warranty_until = DATE_ADD(CURRENT_DATE(), INTERVAL 1 YEAR) WHERE id = ?", [invoice, line.unit.id])
        }
        const [[fresh]] = await connection.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [line.product.id])
        const next = Number(fresh.stock_quantity) - line.quantity
        await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, line.product.id])
        await connection.query(
          "INSERT INTO inventory_logs (product_id, product_unit_id, movement_type, quantity, previous_quantity, new_quantity, reference_type, reference_id, remarks, created_by) VALUES (?, ?, 'SALE', ?, ?, ?, 'SALE', ?, ?, ?)",
          [line.product.id, line.unit?.id ?? null, -line.quantity, fresh.stock_quantity, next, saleId, `Sold via ${invoice}`, req.user.id]
        )
      }
      await connection.query(
        "INSERT INTO payments (sale_id, payment_method, amount, reference_number, payment_status, created_by) VALUES (?, ?, ?, ?, 'COMPLETED', ?)",
        [saleId, method, total, String(req.body.reference_number || '').trim() || null, req.user.id]
      )
      await audit(connection, req.user.id, 'SALE_CREATE', 'SALE', saleId, `Completed sale ${invoice} (₱${total.toLocaleString('en-PH')})`)
      return { id: saleId, invoice_number: invoice, total, change_due: round2(tendered - total) }
    })
    res.status(201).json({ ...result, message: 'Sale completed.' })
  })
)

router.post('/sales/:id/cancel', ownerOnly, param('id').isInt(), body('reason').trim().notEmpty().withMessage('Enter a cancellation reason.'), validate, handle(async (req, res) => {
  await withTransaction(async (connection) => {
    const [[sale]] = await connection.query('SELECT * FROM sales WHERE id = ? FOR UPDATE', [req.params.id])
    if (!sale) fail('Sale not found.', 404)
    if (sale.status !== 'COMPLETED') fail('Only completed sales can be cancelled.')
    const [[returned]] = await connection.query("SELECT COUNT(*) total FROM returns WHERE sale_id = ? AND status IN ('COMPLETED', 'APPROVED')", [sale.id])
    if (returned.total > 0) fail('This sale already has returns. Process remaining items as returns instead of cancelling.')
    const [items] = await connection.query('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id])
    for (const item of items) {
      if (item.product_unit_id) await connection.query("UPDATE product_units SET unit_status = 'IN_STOCK', sale_reference = NULL, warranty_until = NULL WHERE id = ?", [item.product_unit_id])
      const [[product]] = await connection.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [item.product_id])
      const next = Number(product.stock_quantity) + Number(item.quantity)
      await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, item.product_id])
      await connection.query(
        "INSERT INTO inventory_logs (product_id, product_unit_id, movement_type, quantity, previous_quantity, new_quantity, reference_type, reference_id, remarks, created_by) VALUES (?, ?, 'CANCELLATION', ?, ?, ?, 'SALE', ?, ?, ?)",
        [item.product_id, item.product_unit_id, item.quantity, product.stock_quantity, next, sale.id, req.body.reason.trim(), req.user.id]
      )
    }
    await connection.query("UPDATE sales SET status = 'CANCELLED', cancellation_reason = ?, cancelled_by = ?, cancelled_at = NOW() WHERE id = ?", [req.body.reason.trim(), req.user.id, sale.id])
    await connection.query("UPDATE payments SET payment_status = 'VOIDED' WHERE sale_id = ?", [sale.id])
    await audit(connection, req.user.id, 'SALE_CANCEL', 'SALE', sale.id, `Cancelled ${sale.invoice_number}: ${req.body.reason.trim()}`)
  })
  res.json({ message: 'Sale cancelled and stock restored.' })
}))

// ---------- Returns
router.get('/returns', handle(async (req, res) => {
  const search = searchFilter(req.query.search, ['r.return_reference', 's.invoice_number', 'c.full_name', 'r.reason'])
  const filter = where([
    [search.sql, search.values],
    isDate(req.query.from) && ['r.return_date >= ?', req.query.from],
    isDate(req.query.to) && ['r.return_date < DATE_ADD(?, INTERVAL 1 DAY)', req.query.to],
    ['GOOD', 'DEFECTIVE', 'DAMAGED'].includes(req.query.condition) && ['EXISTS (SELECT 1 FROM return_items rx WHERE rx.return_id = r.id AND rx.item_condition = ?)', req.query.condition]
  ])
  const [returns] = await pool.query(`SELECT r.*, s.invoice_number, COALESCE(c.full_name, 'Walk-in Customer') customer, u.name processed_by_name,
      (SELECT GROUP_CONCAT(CONCAT(p.product_name, IF(ri.quantity > 1, CONCAT(' x', FLOOR(ri.quantity)), '')) SEPARATOR ', ') FROM return_items ri JOIN products p ON p.id = ri.product_id WHERE ri.return_id = r.id) items,
      (SELECT GROUP_CONCAT(DISTINCT ri.item_condition) FROM return_items ri WHERE ri.return_id = r.id) conditions
    FROM returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.processed_by
    ${filter.sql} ORDER BY r.return_date DESC, r.id DESC`, filter.values)
  res.json({ returns })
}))

router.get('/returns/:id', param('id').isInt(), validate, handle(async (req, res) => {
  const [[record]] = await pool.query(`SELECT r.*, s.invoice_number, s.sale_date, COALESCE(c.full_name, 'Walk-in Customer') customer, u.name processed_by_name
    FROM returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN users u ON u.id = r.processed_by WHERE r.id = ?`, [req.params.id])
  if (!record) fail('Return not found.', 404)
  const [items] = await pool.query('SELECT ri.*, p.product_name, p.product_code, pu.imei, pu.serial_number, si.unit_price FROM return_items ri JOIN products p ON p.id = ri.product_id JOIN sale_items si ON si.id = ri.sale_item_id LEFT JOIN product_units pu ON pu.id = ri.product_unit_id WHERE ri.return_id = ?', [req.params.id])
  res.json({ return: record, items })
}))

router.post(
  '/returns',
  body('sale_id').isInt({ min: 1 }).withMessage('Choose the original sale.'),
  body('items').isArray({ min: 1 }).withMessage('Select at least one item to return.'),
  body('reason').trim().notEmpty().withMessage('Enter the reason for the return.'),
  body('refund_method').optional({ values: 'falsy' }).isIn(PAYMENT_METHODS),
  validate,
  handle(async (req, res) => {
    const result = await withTransaction(async (connection) => {
      const [[sale]] = await connection.query('SELECT * FROM sales WHERE id = ? FOR UPDATE', [req.body.sale_id])
      if (!sale) fail('Sale not found.', 404)
      if (sale.status !== 'COMPLETED') fail(`This sale is ${sale.status.toLowerCase()} and cannot be returned.`)
      const [[previous]] = await connection.query("SELECT COALESCE(SUM(refund_amount), 0) total FROM returns WHERE sale_id = ? AND status IN ('COMPLETED', 'APPROVED')", [sale.id])
      const paidRatio = Number(sale.subtotal) > 0 ? Number(sale.total) / Number(sale.subtotal) : 1

      const lines = []
      for (const raw of req.body.items) {
        const quantity = Number(raw.quantity)
        if (!quantity) continue
        const condition = ['GOOD', 'DEFECTIVE', 'DAMAGED'].includes(raw.item_condition) ? raw.item_condition : 'GOOD'
        const [[item]] = await connection.query('SELECT si.*, p.product_name FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.id = ? AND si.sale_id = ? FOR UPDATE', [raw.sale_item_id, sale.id])
        if (!item) fail('A selected item does not belong to this sale.')
        const [[done]] = await connection.query("SELECT COALESCE(SUM(ri.quantity), 0) returned FROM return_items ri JOIN returns r ON r.id = ri.return_id WHERE ri.sale_item_id = ? AND r.status IN ('COMPLETED', 'APPROVED')", [item.id])
        const remaining = Number(item.quantity) - Number(done.returned)
        if (!Number.isInteger(quantity) || quantity < 0) fail(`Enter a whole-number quantity for ${item.product_name}.`)
        if (quantity > remaining) fail(remaining <= 0 ? `${item.product_name} has already been fully returned.` : `Only ${remaining} of ${item.product_name} can still be returned.`)
        const refund = round2((Number(item.unit_price) * quantity - (Number(item.discount) * quantity) / Number(item.quantity)) * paidRatio)
        lines.push({ item, quantity, condition, refund })
      }
      if (!lines.length) fail('Enter a return quantity for at least one item.')

      let refundTotal = round2(lines.reduce((sum, line) => sum + line.refund, 0))
      const refundable = round2(Number(sale.total) - Number(previous.total))
      if (refundTotal > refundable) {
        const scale = refundable / refundTotal
        lines.forEach((line) => { line.refund = round2(line.refund * scale) })
        refundTotal = refundable
      }

      const [insert] = await connection.query(
        "INSERT INTO returns (return_reference, sale_id, customer_id, processed_by, return_date, reason, refund_amount, refund_method, refund_reference, status, notes) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, 'COMPLETED', ?)",
        [`TMP-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, sale.id, sale.customer_id, req.user.id, req.body.reason.trim(), refundTotal, req.body.refund_method || 'CASH', req.body.refund_reference || null, req.body.notes || null]
      )
      const returnId = insert.insertId
      const reference = `RET-${localDateKey()}-${String(returnId).padStart(4, '0')}`
      await connection.query('UPDATE returns SET return_reference = ? WHERE id = ?', [reference, returnId])

      for (const { item, quantity, condition, refund } of lines) {
        await connection.query(
          'INSERT INTO return_items (return_id, sale_item_id, product_id, product_unit_id, quantity, refund_amount, item_condition, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [returnId, item.id, item.product_id, item.product_unit_id, quantity, refund, condition, req.body.reason.trim()]
        )
        if (item.product_unit_id) {
          const status = condition === 'GOOD' ? 'IN_STOCK' : condition
          await connection.query("UPDATE product_units SET unit_status = ?, sale_reference = IF(? = 'IN_STOCK', NULL, sale_reference) WHERE id = ?", [status, status, item.product_unit_id])
        }
        if (condition === 'GOOD') {
          const [[product]] = await connection.query('SELECT stock_quantity FROM products WHERE id = ? FOR UPDATE', [item.product_id])
          const next = Number(product.stock_quantity) + quantity
          await connection.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [next, item.product_id])
          await connection.query(
            "INSERT INTO inventory_logs (product_id, product_unit_id, movement_type, quantity, previous_quantity, new_quantity, reference_type, reference_id, remarks, created_by) VALUES (?, ?, 'RETURN', ?, ?, ?, 'RETURN', ?, ?, ?)",
            [item.product_id, item.product_unit_id, quantity, product.stock_quantity, next, returnId, `${reference}: ${req.body.reason.trim()}`.slice(0, 255), req.user.id]
          )
        }
      }

      const [[remaining]] = await connection.query(`SELECT COALESCE(SUM(si.quantity), 0) - COALESCE((SELECT SUM(ri.quantity) FROM return_items ri JOIN returns r ON r.id = ri.return_id
          WHERE r.sale_id = ? AND r.status IN ('COMPLETED', 'APPROVED')), 0) open_quantity FROM sale_items si WHERE si.sale_id = ?`, [sale.id, sale.id])
      if (Number(remaining.open_quantity) <= 0) await connection.query("UPDATE sales SET status = 'RETURNED' WHERE id = ?", [sale.id])
      await audit(connection, req.user.id, 'RETURN', 'RETURN', returnId, `Processed return ${reference} for ${sale.invoice_number} (₱${refundTotal.toLocaleString('en-PH')})`)
      return { id: returnId, return_reference: reference, refund_amount: refundTotal }
    })
    res.status(201).json({ ...result, message: 'Return processed.' })
  })
)

export default router
