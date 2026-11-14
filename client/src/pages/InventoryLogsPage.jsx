import { useState } from 'react'
import { Download, FileClock } from 'lucide-react'
import { Badge, DataTable, PageHeader, Panel, SearchInput, Segmented, Toolbar } from '../components/ui'
import { useApi, useDebounce } from '../hooks/useApi'
import { MOVEMENT_LABELS, dateTime, downloadCsv, isoDay, number } from '../utils/format'

const RANGES = [['7', '7 days'], ['30', '30 days'], ['90', '90 days']]
const TONES = { PURCHASE: 'good', SALE: 'info', RETURN: 'warning', CANCELLATION: 'warning', ADJUSTMENT: 'neutral', DAMAGE: 'critical', TRANSFER: 'neutral' }

export default function InventoryLogsPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [range, setRange] = useState('30')
  const debounced = useDebounce(search)
  const { data, loading, error, reload } = useApi('/inventory/logs', { search: debounced, type, from: isoDay(-(Number(range) - 1)), to: isoDay() })
  const rows = data?.logs || []
  const inbound = rows.filter((row) => Number(row.quantity) > 0).reduce((sum, row) => sum + Number(row.quantity), 0)
  const outbound = rows.filter((row) => Number(row.quantity) < 0).reduce((sum, row) => sum + Number(row.quantity), 0)

  const columns = [
    { key: 'created_at', label: 'Date', primary: true, render: (row) => <><span className="cell-title">{row.product_name}</span><small className="cell-sub">{dateTime(row.created_at)}</small></> },
    { key: 'movement_type', label: 'Movement', render: (row) => <Badge tone={TONES[row.movement_type]}>{MOVEMENT_LABELS[row.movement_type]}</Badge> },
    { key: 'quantity', label: 'Qty', align: 'right', render: (row) => <strong className={Number(row.quantity) > 0 ? 'text-good' : Number(row.quantity) < 0 ? 'text-bad' : ''}>{Number(row.quantity) > 0 ? '+' : ''}{number(row.quantity)}</strong> },
    { key: 'balance', label: 'Stock', align: 'right', render: (row) => `${number(row.previous_quantity)} → ${number(row.new_quantity)}` },
    { key: 'remarks', label: 'Details', render: (row) => <><span className="truncate">{row.remarks || '—'}</span>{(row.imei || row.serial_number) && <small className="cell-sub mono">{row.imei || row.serial_number}</small>}</> },
    { key: 'performed_by', label: 'By', hideMobile: true, render: (row) => row.performed_by || 'System' }
  ]

  return (
    <div>
      <PageHeader eyebrow="STOCK" title="Stock movements" description="Every change to stock: purchases, sales, returns, cancellations and manual adjustments."
        actions={<button type="button" className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv(`stock-movements-${range}d.csv`, [[(row) => dateTime(row.created_at), 'Date'], ['product_code', 'SKU'], ['product_name', 'Product'], ['movement_type', 'Movement'], ['quantity', 'Quantity'], ['previous_quantity', 'Previous'], ['new_quantity', 'New'], [(row) => row.imei || row.serial_number || '', 'IMEI/Serial'], ['remarks', 'Remarks'], ['performed_by', 'By']], rows)}><Download size={16} /> Export CSV</button>} />
      <div className="summary-strip">
        <div><span>Movements</span><strong>{number(rows.length)}</strong></div>
        <div><span>Units in</span><strong className="text-good">+{number(inbound)}</strong></div>
        <div><span>Units out</span><strong className="text-bad">{number(outbound)}</strong></div>
        <div><span>Net change</span><strong>{number(inbound + outbound)}</strong></div>
      </div>
      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search product, SKU, remarks..." />
          <Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Movement type">
            <option value="">All movements</option>{Object.entries(MOVEMENT_LABELS).filter(([value]) => value !== 'TRANSFER').map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Toolbar>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} pageSize={25} empty={{ icon: FileClock, title: 'No stock movements', text: 'Try a longer date range.' }} />
      </Panel>
    </div>
  )
}
