import { useState } from 'react'
import { BadgePercent, Ban, CircleDollarSign, Download, PackageCheck, Printer, Receipt, ShoppingBag, TrendingUp, Undo2 } from 'lucide-react'
import { BarList, ColumnChart, PAYMENT_COLORS, SegmentedBar } from '../components/charts'
import { ErrorBanner, Loader, PageHeader, Panel, Segmented, StatCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { PAYMENT_LABELS, ROLE_LABELS, date, dayLabel, downloadCsv, isoDay, money, moneyShort, number, percent } from '../utils/format'

const PRESETS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['month', 'This month'], ['custom', 'Custom']]
const MEASURES = [['sales', 'Sales'], ['profit', 'Profit'], ['transactions', 'Transactions']]

function printReport() {
  document.body.classList.add('print-page')
  window.addEventListener('afterprint', () => document.body.classList.remove('print-page'), { once: true })
  window.print()
}

function presetRange(preset) {
  if (preset === 'month') return { from: `${isoDay().slice(0, 8)}01`, to: isoDay() }
  return { from: isoDay(-(Number(preset) - 1)), to: isoDay() }
}

export default function ReportsPage() {
  const [preset, setPreset] = useState('30')
  const [custom, setCustom] = useState(presetRange('30'))
  const [measure, setMeasure] = useState('sales')
  const range = preset === 'custom' ? custom : presetRange(preset)
  const { data, loading, error, reload } = useApi('/reports', range)
  const s = data?.summary || {}
  const label = data ? `${date(data.range.from)} – ${date(data.range.to)}` : ''
  const series = (data?.daily || []).map((day) => ({ key: day.day, day: day.day, value: day[measure], sales: day.sales, profit: day.profit, transactions: day.transactions }))
  const formatMeasure = measure === 'transactions' ? number : money

  return (
    <div className="reports">
      <PageHeader eyebrow="ANALYTICS" title="Reports" description={label || 'Sales, profit and stock performance.'}
        actions={<button type="button" className="btn btn-ghost" onClick={printReport}><Printer size={16} /> Print</button>} />

      <div className="report-filters">
        <Segmented label="Report period" options={PRESETS} value={preset} onChange={setPreset} />
        {preset === 'custom' && (
          <div className="date-range">
            <input type="date" value={custom.from} max={custom.to} onChange={(event) => setCustom({ ...custom, from: event.target.value })} aria-label="From date" />
            <span>to</span>
            <input type="date" value={custom.to} min={custom.from} max={isoDay()} onChange={(event) => setCustom({ ...custom, to: event.target.value })} aria-label="To date" />
          </div>
        )}
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      {loading && !data ? <Loader label="Building report..." /> : data && (
        <>
          <div className="stat-grid">
            <StatCard label="Net sales" value={moneyShort(s.netSales)} icon={CircleDollarSign} tone="blue" hint={`Gross ${moneyShort(s.grossSales)} less refunds`} />
            <StatCard label="Gross profit" value={moneyShort(s.grossProfit)} icon={TrendingUp} tone="green" hint={`${percent(s.margin)} margin`} />
            <StatCard label="Transactions" value={number(s.transactions)} icon={Receipt} tone="cyan" hint={`Avg ${money(s.averageSale)} per sale`} />
            <StatCard label="Items sold" value={number(s.itemsSold)} icon={ShoppingBag} tone="violet" hint={`Cost of goods ${moneyShort(s.costOfGoods)}`} />
          </div>
          <div className="stat-grid stat-grid-secondary">
            <StatCard label="Refunds" value={money(s.refunds)} icon={Undo2} tone="amber" hint={`${number(s.returnsCount)} returns`} />
            <StatCard label="Discounts given" value={money(s.discounts)} icon={BadgePercent} tone="orange" hint="Line and sale discounts" />
            <StatCard label="Cancelled sales" value={number(s.cancelledCount)} icon={Ban} tone="red" hint={`${money(s.cancelledTotal)} voided`} />
            <StatCard label="Stock purchased" value={moneyShort(s.purchasesTotal)} icon={PackageCheck} tone="cyan" hint={`${number(s.purchasesCount)} deliveries`} />
          </div>

          <Panel eyebrow="DAILY PERFORMANCE" title={`${MEASURES.find(([value]) => value === measure)[1]} per day`}
            actions={<>
              <Segmented label="Measure" options={MEASURES} value={measure} onChange={setMeasure} />
              <button type="button" className="icon-button bordered" title="Export daily CSV" aria-label="Export daily CSV" onClick={() => downloadCsv(`daily-sales-${range.from}-${range.to}.csv`, [['day', 'Date'], ['transactions', 'Transactions'], ['sales', 'Sales'], ['profit', 'Gross profit']], data.daily)}><Download size={15} /></button>
            </>}>
            <ColumnChart data={series} height={260} axisFormat={measure === 'transactions' ? number : moneyShort} ariaLabel={`Daily ${measure}`}
              xLabel={(point) => dayLabel(point.day, series.length > 45 ? { month: 'short' } : { month: 'short', day: 'numeric' })}
              tooltip={(point) => <><span>{dayLabel(point.day, { weekday: 'short', month: 'short', day: 'numeric' })}</span><strong>{formatMeasure(point.value)}</strong><span>{measure === 'transactions' ? money(point.sales) : `${number(point.transactions)} transactions`}</span></>} />
          </Panel>

          <div className="dashboard-grid">
            <Panel eyebrow="BY CATEGORY" title="Sales by category">
              <BarList format={moneyShort} items={data.byCategory.map((row) => ({ key: row.category_name, label: row.category_name, value: row.revenue, sublabel: `${number(row.quantity)} sold · ${moneyShort(row.profit)} profit` }))} />
            </Panel>
            <Panel eyebrow="PAYMENTS" title="Payment methods">
              <SegmentedBar format={moneyShort} items={data.byPayment.map((row) => ({ key: row.method, label: PAYMENT_LABELS[row.method], value: row.total, color: PAYMENT_COLORS[row.method], detail: `${number(row.transactions)} sales` }))} />
            </Panel>
            <Panel eyebrow="TEAM" title="Staff performance">
              <div className="table-wrap compact-table">
                <table className="data-table">
                  <thead><tr><th>Staff</th><th className="num">Sales</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {data.byCashier.map((row) => (
                      <tr key={row.id}>
                        <td data-label="Staff" className="cell-primary"><span className="cell-title">{row.name}</span><small className="cell-sub">{ROLE_LABELS[row.role]} · avg {money(row.average)}</small></td>
                        <td data-label="Sales" className="num">{number(row.transactions)}</td>
                        <td data-label="Total" className="num"><strong>{moneyShort(row.total)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel eyebrow="BEST SELLERS" title="Top 10 products" flush actions={<button type="button" className="icon-button bordered" aria-label="Export top products CSV" onClick={() => downloadCsv(`top-products-${range.from}-${range.to}.csv`, [['product_code', 'SKU'], ['product_name', 'Product'], ['category_name', 'Category'], ['quantity', 'Qty sold'], ['revenue', 'Revenue'], ['profit', 'Profit']], data.topProducts)}><Download size={15} /></button>}>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Product</th><th>Category</th><th className="num">Qty sold</th><th className="num">Revenue</th><th className="num">Profit</th><th className="num">Margin</th></tr></thead>
                <tbody>
                  {data.topProducts.map((row, index) => (
                    <tr key={row.id}>
                      <td data-label="Rank" className="hide-mobile">{index + 1}</td>
                      <td data-label="Product" className="cell-primary"><span className="cell-title">{row.product_name}</span><small className="cell-sub">{row.product_code}</small></td>
                      <td data-label="Category">{row.category_name}</td>
                      <td data-label="Qty sold" className="num">{number(row.quantity)}</td>
                      <td data-label="Revenue" className="num"><strong>{money(row.revenue)}</strong></td>
                      <td data-label="Profit" className="num">{money(row.profit)}</td>
                      <td data-label="Margin" className="num">{Number(row.revenue) > 0 ? percent(row.profit / row.revenue) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel eyebrow="INVENTORY VALUATION" title="Current stock value" flush actions={<button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadCsv(`inventory-valuation-${isoDay()}.csv`, [['product_code', 'SKU'], ['product_name', 'Product'], ['category_name', 'Category'], ['stock_quantity', 'Stock'], ['cost_price', 'Cost'], ['selling_price', 'Price'], ['inventory_cost_value', 'Cost value'], ['potential_retail_value', 'Retail value']], data.inventory)}><Download size={14} /> CSV</button>}>
            <div className="table-wrap scroll-table">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Category</th><th className="num">Stock</th><th className="num">Cost value</th><th className="num">Retail value</th></tr></thead>
                <tbody>
                  {data.inventory.map((row) => (
                    <tr key={row.product_code}>
                      <td data-label="Product" className="cell-primary"><span className="cell-title">{row.product_name}</span><small className="cell-sub">{row.product_code}</small></td>
                      <td data-label="Category">{row.category_name}</td>
                      <td data-label="Stock" className="num">{number(row.stock_quantity)}</td>
                      <td data-label="Cost value" className="num">{money(row.inventory_cost_value)}</td>
                      <td data-label="Retail value" className="num">{money(row.potential_retail_value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}><strong>Total</strong></td>
                    <td className="num" data-label="Stock"><strong>{number(data.inventory.reduce((sum, row) => sum + Number(row.stock_quantity), 0))}</strong></td>
                    <td className="num" data-label="Cost value"><strong>{money(data.inventory.reduce((sum, row) => sum + Number(row.inventory_cost_value), 0))}</strong></td>
                    <td className="num" data-label="Retail value"><strong>{money(data.inventory.reduce((sum, row) => sum + Number(row.potential_retail_value), 0))}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
