import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Plus, Search, Undo2 } from 'lucide-react'
import { DataTable, DetailList, EmptyState, ErrorBanner, Field, Loader, Modal, PageHeader, Panel, SearchInput, Segmented, StatusBadge, Toolbar } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { useApi, useDebounce } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { PAYMENT_LABELS, dateTime, isoDay, money, number, titleCase, unitIdentifier } from '../utils/format'

const RANGES = [['30', '30 days'], ['90', '90 days'], ['all', 'All time']]
const REASONS = ['Defective / not working', 'Wrong item purchased', 'Changed mind (unopened)', 'Not compatible with device', 'Damaged on arrival']

export default function ReturnsPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [range, setRange] = useState('90')
  const [condition, setCondition] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [creating, setCreating] = useState(Boolean(params.get('sale') || params.get('new')))
  const debounced = useDebounce(search)
  const dates = range === 'all' ? {} : { from: isoDay(-(Number(range) - 1)), to: isoDay() }
  const { data, loading, error, reload } = useApi('/returns', { search: debounced, condition, ...dates })
  const rows = data?.returns || []
  const refundTotal = rows.reduce((sum, row) => sum + Number(row.refund_amount), 0)

  function closeCreate() {
    setCreating(false)
    if (params.get('sale') || params.get('new')) setParams({}, { replace: true })
  }

  const columns = [
    { key: 'return_reference', label: 'Return', primary: true, render: (row) => <><span className="cell-title">{row.return_reference}</span><small className="cell-sub">{dateTime(row.return_date)}</small></> },
    { key: 'invoice_number', label: 'Original sale' },
    { key: 'customer', label: 'Customer', hideMobile: true },
    { key: 'items', label: 'Items', render: (row) => <span className="truncate">{row.items}</span> },
    { key: 'conditions', label: 'Condition', render: (row) => <span className="badge-row">{String(row.conditions || '').split(',').filter(Boolean).map((value) => <StatusBadge key={value} value={value} />)}</span> },
    { key: 'processed_by_name', label: 'Processed by', hideMobile: true },
    { key: 'refund_amount', label: 'Refund', align: 'right', render: (row) => <strong>{money(row.refund_amount)}</strong> }
  ]

  return (
    <div>
      <PageHeader eyebrow="SELLING" title="Returns & refunds" description="Returned items in good condition go back to stock automatically; defective units are set aside."
        actions={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New return</button>} />
      <div className="summary-strip">
        <div><span>Returns</span><strong>{number(rows.length)}</strong></div>
        <div><span>Total refunded</span><strong>{money(refundTotal)}</strong></div>
        <div><span>Restocked</span><strong>{number(rows.filter((row) => String(row.conditions).includes('GOOD')).length)}</strong></div>
        <div><span>Defective / damaged</span><strong>{number(rows.filter((row) => /DEFECTIVE|DAMAGED/.test(row.conditions || '')).length)}</strong></div>
      </div>
      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search return, invoice, customer..." />
          <Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />
          <select value={condition} onChange={(event) => setCondition(event.target.value)} aria-label="Condition">
            <option value="">Any condition</option><option value="GOOD">Good (restocked)</option><option value="DEFECTIVE">Defective</option><option value="DAMAGED">Damaged</option>
          </select>
        </Toolbar>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} onRowClick={(row) => setDetailId(row.id)}
          empty={{ icon: Undo2, title: 'No returns found', text: 'Processed returns will appear here.' }} />
      </Panel>

      <ReturnDetail id={detailId} onClose={() => setDetailId(null)} />
      <NewReturnModal open={creating} initialSaleId={params.get('sale')} onClose={closeCreate} onCreated={() => { closeCreate(); reload() }} />
    </div>
  )
}

function ReturnDetail({ id, onClose }) {
  const { data, loading, error } = useApi(id ? `/returns/${id}` : null)
  const record = data?.return
  return (
    <Modal open={Boolean(id)} onClose={onClose} title={record?.return_reference || 'Return'} subtitle={record ? dateTime(record.return_date) : ''} size="md">
      {loading && !data && <Loader />}
      <ErrorBanner error={error} />
      {record && (
        <div className="stack">
          <DetailList items={[
            ['Original sale', `${record.invoice_number} · ${dateTime(record.sale_date)}`],
            ['Customer', record.customer],
            ['Processed by', record.processed_by_name],
            ['Reason', record.reason],
            ['Refund', <strong key="r">{money(record.refund_amount)} via {PAYMENT_LABELS[record.refund_method] || '—'}</strong>],
            record.refund_reference && ['Refund reference', record.refund_reference],
            record.notes && ['Notes', record.notes]
          ]} />
          <div className="list">
            {(data.items || []).map((item) => (
              <div className="list-row" key={item.id}>
                <div><strong>{item.product_name}</strong><small>{number(item.quantity)} × {money(item.unit_price)}{item.imei || item.serial_number ? ` · ${unitIdentifier(item)}` : ''}</small></div>
                <div className="list-row-end"><strong>{money(item.refund_amount)}</strong><StatusBadge value={item.item_condition} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

function NewReturnModal({ open, initialSaleId, onClose, onCreated }) {
  const notify = useToast()
  const [saleId, setSaleId] = useState(null)
  const [lookup, setLookup] = useState('')
  const debounced = useDebounce(lookup)
  const results = useApi(open && !saleId ? '/sales' : null, { search: debounced, status: 'COMPLETED', from: debounced ? '' : isoDay(-13) })
  const sale = useApi(saleId ? `/sales/${saleId}` : null)
  const [lines, setLines] = useState({})
  const [form, setForm] = useState({ reason: REASONS[0], refund_method: 'CASH', refund_reference: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setSaleId(initialSaleId ? Number(initialSaleId) : null)
    setLookup('')
    setLines({})
    setError('')
    setForm({ reason: REASONS[0], refund_method: 'CASH', refund_reference: '', notes: '' })
  }, [open, initialSaleId])

  const detail = sale.data
  const items = (detail?.items || []).map((item) => ({ ...item, remaining: Number(item.quantity) - Number(item.returned_quantity) }))
  const ratio = detail && Number(detail.sale.subtotal) > 0 ? Number(detail.sale.total) / Number(detail.sale.subtotal) : 1
  const estimate = items.reduce((sum, item) => {
    const quantity = Number(lines[item.id]?.quantity || 0)
    return sum + (Number(item.unit_price) * quantity - (Number(item.discount) * quantity) / Number(item.quantity)) * ratio
  }, 0)
  const selectedCount = Object.values(lines).filter((line) => Number(line.quantity) > 0).length
  const setLine = (id, patch) => setLines((current) => ({ ...current, [id]: { quantity: 0, item_condition: 'GOOD', ...current[id], ...patch } }))

  async function submit() {
    setError('')
    setBusy(true)
    try {
      const payload = { sale_id: saleId, ...form, items: Object.entries(lines).filter(([, line]) => Number(line.quantity) > 0).map(([id, line]) => ({ sale_item_id: Number(id), quantity: Number(line.quantity), item_condition: line.item_condition })) }
      const { data } = await api.post('/returns', payload)
      notify(`Return ${data.return_reference} processed. Refund ${money(data.refund_amount)}.`)
      onCreated()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Process a return" subtitle={detail ? `${detail.sale.invoice_number} · ${detail.sale.customer} · ${dateTime(detail.sale.sale_date)}` : 'Find the original sale'}
      footer={saleId && <>
        <span className="footer-note">Refund estimate: <strong>{money(estimate)}</strong></span>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || !selectedCount || !form.reason.trim()} onClick={submit}>{busy ? 'Processing...' : 'Complete return'}</button>
      </>}>
      {!saleId ? (
        <div className="stack">
          <SearchInput value={lookup} onChange={setLookup} placeholder="Invoice number or customer name..." />
          {!debounced && <p className="muted-text">Showing completed sales from the last 14 days. Search to find older sales.</p>}
          <ErrorBanner error={results.error} />
          {results.loading && !results.data ? <Loader /> : (results.data?.sales || []).length === 0 ? <EmptyState icon={Search} title="No matching sales" text="Only completed sales can be returned." /> : (
            <div className="list scroll-list">
              {(results.data?.sales || []).slice(0, 40).map((row) => (
                <button type="button" key={row.id} className="list-row clickable" onClick={() => setSaleId(row.id)}>
                  <div><strong>{row.invoice_number}</strong><small>{row.customer} · {dateTime(row.sale_date)} · {number(row.item_count)} item(s)</small></div>
                  <strong>{money(row.total)}</strong>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="stack">
          {!initialSaleId && <button type="button" className="text-button back-link" onClick={() => { setSaleId(null); setLines({}) }}><ArrowLeft size={14} /> Choose a different sale</button>}
          {sale.loading && !detail && <Loader />}
          <ErrorBanner error={sale.error} />
          {detail && detail.sale.status !== 'COMPLETED' && <div className="alert alert-warning">This sale is {titleCase(detail.sale.status).toLowerCase()} and cannot be returned.</div>}
          {detail && (
            <div className="return-items">
              {items.map((item) => (
                <div className={`return-item ${item.remaining <= 0 ? 'disabled' : ''}`} key={item.id}>
                  <div className="return-item-info">
                    <strong>{item.product_name}</strong>
                    <small>{money(item.unit_price)} · sold {number(item.quantity)}{Number(item.returned_quantity) > 0 ? ` · returned ${number(item.returned_quantity)}` : ''}{item.imei || item.serial_number ? ` · ${unitIdentifier(item)}` : ''}</small>
                  </div>
                  {item.remaining > 0 ? (
                    <div className="return-item-controls">
                      <label><span>Qty</span>
                        <select value={lines[item.id]?.quantity || 0} onChange={(event) => setLine(item.id, { quantity: Number(event.target.value) })}>
                          {Array.from({ length: item.remaining + 1 }, (_, index) => <option key={index} value={index}>{index}</option>)}
                        </select>
                      </label>
                      <label><span>Condition</span>
                        <select value={lines[item.id]?.item_condition || 'GOOD'} onChange={(event) => setLine(item.id, { item_condition: event.target.value })}>
                          <option value="GOOD">Good: restock</option><option value="DEFECTIVE">Defective</option><option value="DAMAGED">Damaged</option>
                        </select>
                      </label>
                    </div>
                  ) : <StatusBadge value="RETURNED" label="Fully returned" />}
                </div>
              ))}
            </div>
          )}
          <div className="form-grid">
            <Field label="Reason" required full>
              <input list="return-reasons" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
              <datalist id="return-reasons">{REASONS.map((reason) => <option key={reason} value={reason} />)}</datalist>
            </Field>
            <Field label="Refund method">
              <select value={form.refund_method} onChange={(event) => setForm({ ...form, refund_method: event.target.value })}>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </Field>
            <Field label="Refund reference"><input value={form.refund_reference} onChange={(event) => setForm({ ...form, refund_reference: event.target.value })} placeholder="Optional" /></Field>
            <Field label="Notes" full><textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Inspection notes, accessories included, etc." /></Field>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
        </div>
      )}
    </Modal>
  )
}
