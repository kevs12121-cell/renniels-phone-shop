import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardList, PackagePlus, Plus, Trash2 } from 'lucide-react'
import { DataTable, DetailList, ErrorBanner, Field, Loader, Modal, PageHeader, Panel, SearchInput, Segmented, StatusBadge, Toolbar } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { useApi, useDebounce } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { date, dateTime, isoDay, money, number } from '../utils/format'

const RANGES = [['30', '30 days'], ['90', '90 days'], ['all', 'All time']]

export default function PurchasesPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [payment, setPayment] = useState('')
  const [range, setRange] = useState('90')
  const [detailId, setDetailId] = useState(null)
  const [creating, setCreating] = useState(Boolean(params.get('new')))
  const debounced = useDebounce(search)
  const dates = range === 'all' ? {} : { from: isoDay(-(Number(range) - 1)), to: isoDay() }
  const { data, loading, error, reload } = useApi('/purchases', { search: debounced, supplier_id: supplierId, payment_status: payment, ...dates })
  const suppliers = useApi('/suppliers')
  const rows = data?.purchases || []
  const unpaid = rows.filter((row) => row.payment_status !== 'PAID')

  function closeCreate() {
    setCreating(false)
    if (params.get('new')) setParams({}, { replace: true })
  }

  const columns = [
    { key: 'reference_number', label: 'Reference', primary: true, render: (row) => <><span className="cell-title">{row.reference_number}</span><small className="cell-sub">{date(row.purchase_date)}</small></> },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'item_count', label: 'Items', align: 'right', render: (row) => <>{number(row.item_count)} lines<small className="cell-sub">{number(row.total_quantity)} units</small></> },
    { key: 'total', label: 'Total', align: 'right', render: (row) => <strong>{money(row.total)}</strong> },
    { key: 'payment_status', label: 'Payment', render: (row) => <StatusBadge value={row.payment_status} /> },
    { key: 'created_by_name', label: 'Received by', hideMobile: true }
  ]

  return (
    <div>
      <PageHeader eyebrow="STOCK" title="Purchases" description="Receive stock from suppliers. Quantities, IMEI units and costs update automatically."
        actions={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><PackagePlus size={16} /> Receive stock</button>} />
      <div className="summary-strip">
        <div><span>Purchase orders</span><strong>{number(rows.length)}</strong></div>
        <div><span>Total cost</span><strong>{money(rows.reduce((sum, row) => sum + Number(row.total), 0))}</strong></div>
        <div><span>Unpaid / partial</span><strong>{number(unpaid.length)}</strong></div>
        <div><span>Payable balance</span><strong>{money(unpaid.reduce((sum, row) => sum + Number(row.total), 0))}</strong></div>
      </div>
      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search reference, supplier..." />
          <Segmented label="Date range" options={RANGES} value={range} onChange={setRange} />
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} aria-label="Supplier">
            <option value="">All suppliers</option>{(suppliers.data?.suppliers || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}
          </select>
          <select value={payment} onChange={(event) => setPayment(event.target.value)} aria-label="Payment status">
            <option value="">Any payment</option><option value="PAID">Paid</option><option value="PARTIAL">Partial</option><option value="UNPAID">Unpaid</option>
          </select>
        </Toolbar>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} onRowClick={(row) => setDetailId(row.id)} empty={{ icon: ClipboardList, title: 'No purchases found' }} />
      </Panel>
      <PurchaseDetail id={detailId} onClose={() => setDetailId(null)} onChanged={reload} />
      <PurchaseForm open={creating} suppliers={(suppliers.data?.suppliers || []).filter((supplier) => supplier.status === 'ACTIVE')} onClose={closeCreate} onSaved={() => { closeCreate(); reload() }} />
    </div>
  )
}

function PurchaseDetail({ id, onClose, onChanged }) {
  const notify = useToast()
  const { data, loading, error, reload } = useApi(id ? `/purchases/${id}` : null)
  const purchase = data?.purchase

  async function setPayment(status) {
    try {
      await api.put(`/purchases/${id}/payment`, { payment_status: status })
      notify('Payment status updated.')
      reload()
      onChanged()
    } catch (err) {
      notify(errorMessage(err), 'error')
    }
  }

  return (
    <Modal open={Boolean(id)} onClose={onClose} size="lg" title={purchase?.reference_number || 'Purchase'} subtitle={purchase ? `${purchase.supplier_name} · ${date(purchase.purchase_date)}` : ''}>
      {loading && !data && <Loader />}
      <ErrorBanner error={error} />
      {purchase && (
        <div className="stack">
          <DetailList items={[
            ['Supplier', `${purchase.supplier_name}${purchase.contact_person ? ` · ${purchase.contact_person}` : ''}`],
            ['Received by', `${purchase.created_by_name || '—'} · ${dateTime(purchase.created_at)}`],
            ['Subtotal', money(purchase.subtotal)],
            Number(purchase.discount) > 0 && ['Discount', `-${money(purchase.discount)}`],
            ['Total', <strong key="t">{money(purchase.total)}</strong>],
            ['Payment', <select key="p" className="inline-select" value={purchase.payment_status} onChange={(event) => setPayment(event.target.value)}><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partial</option><option value="PAID">Paid</option></select>],
            purchase.notes && ['Notes', purchase.notes]
          ]} />
          <div className="table-wrap compact-table">
            <table className="data-table">
              <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Subtotal</th></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Product" className="cell-primary">
                      <span className="cell-title">{item.product_name}</span><small className="cell-sub">{item.product_code}</small>
                      {item.units.length > 0 && <small className="cell-sub mono unit-chips">{item.units.map((unit) => <span key={unit.id} className={unit.unit_status !== 'IN_STOCK' ? 'sold' : ''} title={unit.unit_status}>{unit.imei || unit.serial_number}</span>)}</small>}
                    </td>
                    <td data-label="Qty" className="num">{number(item.quantity)}</td>
                    <td data-label="Unit cost" className="num">{money(item.unit_cost)}</td>
                    <td data-label="Subtotal" className="num">{money(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

const newLine = () => ({ key: Math.random().toString(36).slice(2), product_id: '', quantity: 1, unit_cost: '', identifiers: '' })

function PurchaseForm({ open, suppliers, onClose, onSaved }) {
  const notify = useToast()
  const products = useApi(open ? '/products' : null, { status: 'ACTIVE' })
  const [form, setForm] = useState({ supplier_id: '', purchase_date: isoDay(), reference_number: '', payment_status: 'UNPAID', discount: '', notes: '' })
  const [lines, setLines] = useState([newLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    setForm({ supplier_id: '', purchase_date: isoDay(), reference_number: '', payment_status: 'UNPAID', discount: '', notes: '' })
    setLines([newLine()])
    setError('')
  }, [open])

  const productList = products.data?.products || []
  const productById = Object.fromEntries(productList.map((product) => [String(product.id), product]))
  const supplierProducts = form.supplier_id ? productList.filter((product) => String(product.supplier_id) === String(form.supplier_id)) : []
  const otherProducts = productList.filter((product) => !supplierProducts.includes(product))
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0), 0)
  const updateLine = (key, patch) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  async function save(event) {
    event.preventDefault()
    setError('')
    const items = lines.filter((line) => line.product_id)
    if (!items.length) { setError('Add at least one product.'); return }
    setBusy(true)
    try {
      const { data } = await api.post('/purchases', {
        ...form,
        items: items.map((line) => ({ product_id: Number(line.product_id), quantity: Number(line.quantity), unit_cost: Number(line.unit_cost), identifiers: line.identifiers }))
      })
      notify(`${data.reference_number} received. Stock updated.`)
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Receive stock" subtitle="Record a supplier delivery. Stock increases as soon as you save."
      footer={<><span className="footer-note">Total: <strong>{money(Math.max(0, subtotal - Number(form.discount || 0)))}</strong></span><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="purchase-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Receive stock'}</button></>}>
      <form id="purchase-form" className="stack" onSubmit={save}>
        <div className="form-grid cols-3">
          <Field label="Supplier" required><select value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })} required><option value="">Choose supplier...</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></Field>
          <Field label="Delivery date" required><input type="date" value={form.purchase_date} max={isoDay()} onChange={(event) => setForm({ ...form, purchase_date: event.target.value })} required /></Field>
          <Field label="Supplier invoice / DR no." hint="Leave blank to auto-generate"><input value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} /></Field>
        </div>

        <div className="purchase-lines">
          {lines.map((line, index) => {
            const product = productById[String(line.product_id)]
            const count = String(line.identifiers).split(/[\s,]+/).filter(Boolean).length
            return (
              <div className="purchase-line" key={line.key}>
                <span className="line-number">{index + 1}</span>
                <Field label="Product">
                  <select value={line.product_id} onChange={(event) => { const selected = productById[event.target.value]; updateLine(line.key, { product_id: event.target.value, unit_cost: selected ? selected.cost_price : '', identifiers: '' }) }}>
                    <option value="">Choose product...</option>
                    {supplierProducts.length > 0 && <optgroup label="From this supplier">{supplierProducts.map((option) => <option key={option.id} value={option.id}>{option.product_name} ({number(option.stock_quantity)} on hand)</option>)}</optgroup>}
                    <optgroup label={supplierProducts.length ? 'Other products' : 'Products'}>{otherProducts.map((option) => <option key={option.id} value={option.id}>{option.product_name} ({number(option.stock_quantity)} on hand)</option>)}</optgroup>
                  </select>
                </Field>
                <Field label="Qty"><input type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></Field>
                <Field label="Unit cost (₱)"><input type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => updateLine(line.key, { unit_cost: event.target.value })} /></Field>
                <div className="line-total"><span>Line total</span><strong>{money(Number(line.quantity || 0) * Number(line.unit_cost || 0))}</strong></div>
                <button type="button" className="icon-button danger" onClick={() => setLines((current) => (current.length > 1 ? current.filter((entry) => entry.key !== line.key) : [newLine()]))} aria-label="Remove line"><Trash2 size={16} /></button>
                {product?.is_serialized ? (
                  <Field label={`IMEI / serial numbers (${count} of ${number(line.quantity)})`} full hint="One per line or separated by spaces. Each unit must be unique.">
                    <textarea rows={Math.min(5, Math.max(2, Number(line.quantity)))} className="mono" value={line.identifiers} onChange={(event) => updateLine(line.key, { identifiers: event.target.value })} placeholder="356789012345678" />
                  </Field>
                ) : null}
              </div>
            )
          })}
          <button type="button" className="btn btn-ghost btn-sm add-line" onClick={() => setLines((current) => [...current, newLine()])}><Plus size={15} /> Add product line</button>
        </div>

        <div className="form-grid cols-3">
          <Field label="Discount (₱)"><input type="number" min="0" step="0.01" value={form.discount} onChange={(event) => setForm({ ...form, discount: event.target.value })} /></Field>
          <Field label="Payment status"><select value={form.payment_status} onChange={(event) => setForm({ ...form, payment_status: event.target.value })}><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partial</option><option value="PAID">Paid</option></select></Field>
          <Field label="Notes"><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </form>
    </Modal>
  )
}
