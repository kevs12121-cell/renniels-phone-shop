import { useState } from 'react'
import { Download, Receipt } from 'lucide-react'
import SaleDetailModal from '../components/SaleDetailModal'
import { DataTable, PageHeader, Panel, SearchInput, Segmented, StatusBadge, Toolbar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi, useDebounce } from '../hooks/useApi'
import { PAYMENT_LABELS, dateTime, downloadCsv, isoDay, money, number } from '../utils/format'

const RANGES = [['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['all', 'All time']]

function rangeDates(range) {
  if (range === 'today') return { from: isoDay(), to: isoDay() }
  if (range === '7') return { from: isoDay(-6), to: isoDay() }
  if (range === '30') return { from: isoDay(-29), to: isoDay() }
  return { from: '', to: '' }
}

export default function SalesPage() {
  const { isOwner } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [range, setRange] = useState('30')
  const [method, setMethod] = useState('')
  const [cashier, setCashier] = useState('')
  const [mine, setMine] = useState(false)
  const [saleId, setSaleId] = useState(null)
  const debounced = useDebounce(search)
  const dates = rangeDates(range)
  const { data, loading, error, reload } = useApi('/sales', { search: debounced, status, ...dates, payment_method: method, cashier_id: cashier, mine: mine ? '1' : '' })
  const users = useApi(isOwner ? '/users' : null)
  const sales = data?.sales || []
  const live = sales.filter((sale) => sale.status !== 'CANCELLED')
  const totals = { count: live.length, amount: live.reduce((sum, sale) => sum + Number(sale.total), 0), refunded: sales.reduce((sum, sale) => sum + Number(sale.refunded), 0) }

  const columns = [
    { key: 'invoice_number', label: 'Invoice', primary: true, render: (row) => <><span className="cell-title">{row.invoice_number}</span><small className="cell-sub">{dateTime(row.sale_date)}</small></> },
    { key: 'customer', label: 'Customer' },
    { key: 'cashier', label: 'Cashier', hideMobile: !isOwner },
    { key: 'item_count', label: 'Items', align: 'right', render: (row) => number(row.item_count), hideMobile: true },
    { key: 'payment_method', label: 'Payment', render: (row) => PAYMENT_LABELS[row.payment_method] || '—' },
    { key: 'total', label: 'Total', align: 'right', render: (row) => <><strong>{money(row.total)}</strong>{Number(row.refunded) > 0 && <small className="cell-sub warn">-{money(row.refunded)} refunded</small>}</> },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> }
  ]

  return (
    <div>
      <PageHeader eyebrow="SELLING" title="Sales history" description={isOwner ? 'Every transaction across the shop. Open a sale to view its receipt, cancel it or start a return.' : 'Every transaction in the shop. Open a sale to reprint the receipt or start a return.'}
        actions={isOwner && <button type="button" className="btn btn-ghost" disabled={!sales.length} onClick={() => downloadCsv(`sales-${dates.from || 'all'}-${dates.to || 'time'}.csv`, [['invoice_number', 'Invoice'], [(row) => dateTime(row.sale_date), 'Date'], ['customer', 'Customer'], ['cashier', 'Cashier'], ['item_count', 'Items'], [(row) => PAYMENT_LABELS[row.payment_method], 'Payment'], ['discount', 'Discount'], ['total', 'Total'], ['refunded', 'Refunded'], ['status', 'Status']], sales)}><Download size={16} /> Export CSV</button>} />

      <div className="summary-strip">
        <div><span>Sales</span><strong>{number(totals.count)}</strong></div>
        <div><span>Amount</span><strong>{money(totals.amount)}</strong></div>
        <div><span>Refunded</span><strong>{money(totals.refunded)}</strong></div>
        <div><span>Average</span><strong>{money(totals.count ? totals.amount / totals.count : 0)}</strong></div>
      </div>

      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search invoice, customer, cashier..." />
          <Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
            <option value="">All statuses</option><option value="COMPLETED">Completed</option><option value="RETURNED">Returned</option><option value="CANCELLED">Cancelled</option>
          </select>
          <select value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Payment method">
            <option value="">All payments</option>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {isOwner ? (
            <select value={cashier} onChange={(event) => setCashier(event.target.value)} aria-label="Cashier">
              <option value="">All staff</option>{(users.data?.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          ) : (
            <label className="toggle"><input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} /> My sales only</label>
          )}
        </Toolbar>
        <DataTable columns={columns} rows={sales} loading={loading} error={error} onRetry={reload} onRowClick={(row) => setSaleId(row.id)}
          empty={{ icon: Receipt, title: 'No sales found', text: 'Try another date range or clear the filters.' }} />
      </Panel>

      <SaleDetailModal saleId={saleId} onClose={() => setSaleId(null)} onChanged={reload} />
    </div>
  )
}
