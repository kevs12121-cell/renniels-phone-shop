import { Router } from 'express'
import { pool } from '../config/db.js'
import { handle, localDate } from '../utils/http.js'

const router = Router()

function fillDays(rows, days) {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const series = []
  for (let i = days - 1; i >= 0; i--) {
    const day = localDate(new Date(Date.now() - i * 86400000))
    const row = byDay.get(day)
    series.push({ day, sales: Number(row?.sales || 0), transactions: Number(row?.transactions || 0) })
  }
  return series
}

router.get('/dashboard', handle(async (req, res) => {
  const isOwner = req.user.role === 'OWNER'
  // Cashiers see their own selling performance; the owner sees the whole shop.
  const scope = isOwner ? '' : 'AND s.processed_by = ?'
  const scopeValues = isOwner ? [] : [req.user.id]
  const live = "s.status <> 'CANCELLED'"

  const [[today]] = await pool.query(`SELECT COALESCE(SUM(s.total), 0) sales, COUNT(*) transactions, COALESCE(AVG(s.total), 0) average FROM sales s WHERE ${live} AND DATE(s.sale_date) = CURRENT_DATE() ${scope}`, scopeValues)
  const [[yesterday]] = await pool.query(`SELECT COALESCE(SUM(s.total), 0) sales, COUNT(*) transactions FROM sales s WHERE ${live} AND DATE(s.sale_date) = CURRENT_DATE() - INTERVAL 1 DAY ${scope}`, scopeValues)
  const [[month]] = await pool.query(`SELECT COALESCE(SUM(s.total), 0) sales, COUNT(*) transactions FROM sales s WHERE ${live} AND s.sale_date >= DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01') ${scope}`, scopeValues)
  const [[todayItems]] = await pool.query(`SELECT COALESCE(SUM(si.quantity), 0) items, COALESCE(SUM(si.quantity * si.unit_cost), 0) cost FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${live} AND DATE(s.sale_date) = CURRENT_DATE() ${scope}`, scopeValues)
  const [[stock]] = await pool.query(`SELECT COUNT(*) totalProducts,
      COALESCE(SUM(stock_quantity > 0 AND stock_quantity <= reorder_level), 0) lowStock,
      COALESCE(SUM(stock_quantity <= 0), 0) outOfStock,
      COALESCE(SUM(stock_quantity * cost_price), 0) inventoryCost,
      COALESCE(SUM(stock_quantity * selling_price), 0) inventoryRetail,
      COALESCE(SUM(stock_quantity), 0) unitsOnHand
    FROM products WHERE status = 'ACTIVE'`)
  const [[people]] = await pool.query("SELECT (SELECT COUNT(*) FROM customers WHERE status = 'ACTIVE') customers, (SELECT COUNT(*) FROM suppliers WHERE status = 'ACTIVE') suppliers, (SELECT COUNT(*) FROM product_units WHERE unit_status = 'IN_STOCK') serializedInStock")
  const [[returnsToday]] = await pool.query(`SELECT COUNT(*) count, COALESCE(SUM(refund_amount), 0) total FROM returns r WHERE DATE(r.return_date) = CURRENT_DATE() ${isOwner ? '' : 'AND r.processed_by = ?'}`, scopeValues)

  const [trendRows] = await pool.query(`SELECT DATE_FORMAT(s.sale_date, '%Y-%m-%d') day, SUM(s.total) sales, COUNT(*) transactions FROM sales s WHERE ${live} AND s.sale_date >= CURRENT_DATE() - INTERVAL 13 DAY ${scope} GROUP BY day`, scopeValues)
  const [recentSales] = await pool.query(`SELECT s.id, s.invoice_number, s.total, s.status, s.sale_date, COALESCE(c.full_name, 'Walk-in Customer') customer, u.name cashier,
      (SELECT payment_method FROM payments WHERE sale_id = s.id ORDER BY id LIMIT 1) payment_method
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.processed_by
    WHERE 1 = 1 ${scope} ORDER BY s.sale_date DESC LIMIT 8`, scopeValues)
  const [lowStock] = await pool.query("SELECT id, product_code, product_name, stock_quantity, reorder_level FROM products WHERE status = 'ACTIVE' AND stock_quantity <= reorder_level ORDER BY stock_quantity ASC, product_name LIMIT 8")
  const [topProducts] = await pool.query(`SELECT p.id, p.product_name, SUM(si.quantity) quantity, SUM(si.subtotal) revenue
    FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
    WHERE ${live} AND s.sale_date >= CURRENT_DATE() - INTERVAL 29 DAY ${scope}
    GROUP BY p.id, p.product_name ORDER BY revenue DESC LIMIT 5`, scopeValues)
  const [paymentMix] = await pool.query(`SELECT pay.payment_method method, COUNT(*) transactions, SUM(pay.amount) total
    FROM payments pay JOIN sales s ON s.id = pay.sale_id
    WHERE ${live} AND s.sale_date >= CURRENT_DATE() - INTERVAL 29 DAY ${scope}
    GROUP BY pay.payment_method ORDER BY total DESC`, scopeValues)

  res.json({
    scope: isOwner ? 'shop' : 'personal',
    metrics: {
      todaySales: today.sales,
      todayTransactions: today.transactions,
      todayAverage: today.average,
      todayItems: todayItems.items,
      todayProfit: isOwner ? today.sales - todayItems.cost : undefined,
      yesterdaySales: yesterday.sales,
      monthSales: month.sales,
      monthTransactions: month.transactions,
      todayRefunds: returnsToday.total,
      todayReturns: returnsToday.count,
      ...stock,
      inventoryCost: isOwner ? stock.inventoryCost : undefined,
      ...people
    },
    salesTrend: fillDays(trendRows, 14),
    recentSales,
    lowStock,
    topProducts,
    paymentMix
  })
}))

export default router
