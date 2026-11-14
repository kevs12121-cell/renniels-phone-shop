import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Boxes, PackagePlus, SlidersHorizontal } from 'lucide-react'
import { DataTable, Field, Modal, PageHeader, Panel, SearchInput, Segmented, StatCard, StatusBadge, Toolbar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi, useDebounce } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { money, moneyShort, number, relativeTime } from '../utils/format'

const FILTERS = [['', 'All'], ['LOW', 'Low stock'], ['OUT', 'Out of stock'], ['IN', 'Healthy']]

export default function InventoryPage() {
  const { isOwner } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [adjusting, setAdjusting] = useState(null)
  const debounced = useDebounce(search)
  const { data, loading, error, reload } = useApi('/inventory', { search: debounced, status, category_id: categoryId })
  const all = useApi('/inventory')
  const categories = useApi('/categories')
  const rows = data?.inventory || []
  const everything = all.data?.inventory || []
  const summary = {
    units: everything.reduce((sum, row) => sum + Number(row.stock_quantity), 0),
    cost: everything.reduce((sum, row) => sum + Number(row.cost_value || 0), 0),
    retail: everything.reduce((sum, row) => sum + Number(row.retail_value), 0),
    low: everything.filter((row) => row.stock_status === 'LOW STOCK').length,
    out: everything.filter((row) => row.stock_status === 'OUT OF STOCK').length
  }

  const columns = [
    { key: 'product_name', label: 'Product', primary: true, render: (row) => <><span className="cell-title">{row.product_name}</span><small className="cell-sub">{row.product_code} · {row.category_name}</small></> },
    { key: 'stock_quantity', label: 'On hand', align: 'right', render: (row) => <strong>{number(row.stock_quantity)}</strong> },
    { key: 'reorder_level', label: 'Reorder at', align: 'right', render: (row) => number(row.reorder_level) },
    { key: 'stock_status', label: 'Status', render: (row) => <StatusBadge value={row.stock_status} /> },
    isOwner
      ? { key: 'cost_value', label: 'Stock value (cost)', align: 'right', hideMobile: true, render: (row) => money(row.cost_value) }
      : { key: 'retail_value', label: 'Retail value', align: 'right', hideMobile: true, render: (row) => money(row.retail_value) },
    { key: 'last_movement', label: 'Last movement', hideMobile: true, render: (row) => relativeTime(row.last_movement) },
    isOwner && { key: 'actions', label: '', actions: true, render: (row) => <button type="button" className="btn btn-ghost btn-sm" onClick={(event) => { event.stopPropagation(); setAdjusting(row) }}><SlidersHorizontal size={14} /> Adjust</button> }
  ].filter(Boolean)

  return (
    <div>
      <PageHeader eyebrow="STOCK" title="Inventory" description={isOwner ? 'Stock on hand, reorder alerts and manual adjustments for damage or count corrections.' : 'Live stock on hand so you can answer customers right away.'}
        actions={isOwner && <Link to="/purchases?new=1" className="btn btn-primary"><PackagePlus size={16} /> Receive stock</Link>} />
      <div className="stat-grid">
        <StatCard label="Units on hand" value={number(summary.units)} icon={Boxes} tone="blue" hint={`${everything.length} active products`} loading={all.loading && !all.data} />
        {isOwner
          ? <StatCard label="Stock value (cost)" value={moneyShort(summary.cost)} icon={Boxes} tone="green" hint={`${moneyShort(summary.retail)} at retail`} loading={all.loading && !all.data} />
          : <StatCard label="Retail value" value={moneyShort(summary.retail)} icon={Boxes} tone="green" hint="At current selling prices" loading={all.loading && !all.data} />}
        <StatCard label="Low stock" value={number(summary.low)} icon={AlertTriangle} tone="amber" hint="At or below reorder level" loading={all.loading && !all.data} />
        <StatCard label="Out of stock" value={number(summary.out)} icon={AlertTriangle} tone="red" hint="Cannot be sold until restocked" loading={all.loading && !all.data} />
      </div>
      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search product, SKU, brand..." />
          <Segmented label="Stock status" options={FILTERS} value={status} onChange={setStatus} />
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Category">
            <option value="">All categories</option>{(categories.data?.categories || []).map((category) => <option key={category.id} value={category.id}>{category.category_name}</option>)}
          </select>
        </Toolbar>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} pageSize={20} empty={{ icon: Boxes, title: 'No products match', text: 'Try a different filter.' }} />
      </Panel>
      <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); reload(); all.reload() }} />
    </div>
  )
}

function AdjustModal({ product, onClose, onSaved }) {
  const notify = useToast()
  const [form, setForm] = useState({ direction: 'DECREASE', quantity: 1, movement_type: 'ADJUSTMENT', remarks: '', product_unit_id: '', unit_status: 'DAMAGED' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const serialized = Boolean(product?.is_serialized)
  const units = useApi(product && serialized ? `/products/${product.id}/units` : null, { status: form.direction === 'DECREASE' ? 'IN_STOCK' : 'DAMAGED,DEFECTIVE,RETURNED,RESERVED' })
  useEffect(() => { if (product) { setForm({ direction: 'DECREASE', quantity: 1, movement_type: 'ADJUSTMENT', remarks: '', product_unit_id: '', unit_status: 'DAMAGED' }); setError('') } }, [product])
  useEffect(() => { setForm((current) => ({ ...current, product_unit_id: '' })) }, [form.direction])

  const change = serialized ? 1 : Number(form.quantity || 0)
  const next = product ? Number(product.stock_quantity) + (form.direction === 'DECREASE' ? -change : change) : 0

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/inventory/adjust', { ...form, product_id: product.id, movement_type: form.direction === 'DECREASE' ? form.movement_type : 'ADJUSTMENT' })
      notify('Stock adjusted.')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(product)} onClose={onClose} size="md" title="Adjust stock" subtitle={product ? `${product.product_name} · ${number(product.stock_quantity)} on hand` : ''}
      footer={<><span className="footer-note">New stock: <strong>{number(next)}</strong></span><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="adjust-form" className="btn btn-primary" disabled={busy || next < 0}>{busy ? 'Saving...' : 'Save adjustment'}</button></>}>
      <form id="adjust-form" className="form-grid" onSubmit={save}>
        <Field label="Direction" full>
          <Segmented label="Direction" options={[['DECREASE', serialized ? 'Remove a unit' : 'Remove stock'], ['INCREASE', serialized ? 'Restore a unit' : 'Add stock']]} value={form.direction} onChange={(direction) => setForm({ ...form, direction })} />
        </Field>
        {serialized ? (
          <>
            <Field label={form.direction === 'DECREASE' ? 'Unit to remove' : 'Unit to restore'} required full hint={form.direction === 'INCREASE' ? 'Only damaged, defective or returned units can be restored after repair.' : undefined}>
              <select value={form.product_unit_id} onChange={(event) => setForm({ ...form, product_unit_id: event.target.value })} required>
                <option value="">{units.loading ? 'Loading units...' : (units.data?.units || []).length ? 'Choose IMEI / serial...' : 'No eligible units'}</option>
                {(units.data?.units || []).map((unit) => <option key={unit.id} value={unit.id}>{unit.imei || unit.serial_number} · {unit.unit_status.replace('_', ' ')}</option>)}
              </select>
            </Field>
            {form.direction === 'DECREASE' && (
              <Field label="Mark unit as">
                <select value={form.unit_status} onChange={(event) => setForm({ ...form, unit_status: event.target.value, movement_type: event.target.value === 'DAMAGED' ? 'DAMAGE' : 'ADJUSTMENT' })}>
                  <option value="DAMAGED">Damaged</option><option value="DEFECTIVE">Defective</option><option value="RESERVED">Reserved for customer</option>
                </select>
              </Field>
            )}
          </>
        ) : (
          <>
            <Field label="Quantity" required><input type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required /></Field>
            {form.direction === 'DECREASE' && (
              <Field label="Type"><select value={form.movement_type} onChange={(event) => setForm({ ...form, movement_type: event.target.value })}><option value="ADJUSTMENT">Count correction</option><option value="DAMAGE">Damaged / write-off</option></select></Field>
            )}
          </>
        )}
        <Field label="Reason" required full><textarea rows={2} value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} required placeholder="e.g. Cycle count found 1 extra unit" /></Field>
        {error && <div className="alert alert-error field-full">{error}</div>}
      </form>
    </Modal>
  )
}
