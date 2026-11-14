import { useEffect, useState } from 'react'
import { Edit3, Plus, Truck } from 'lucide-react'
import { DataTable, DetailList, ErrorBanner, Field, Loader, Modal, PageHeader, Panel, SearchInput, Segmented, StatusBadge, Toolbar } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { useApi, useDebounce } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { date, money, number } from '../utils/format'

const EMPTY = { supplier_name: '', contact_person: '', phone: '', email: '', address: '', notes: '', status: 'ACTIVE' }

export default function SuppliersPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [editing, setEditing] = useState(null)
  const debounced = useDebounce(search)
  const { data, loading, error, reload } = useApi('/suppliers', { search: debounced, status })
  const rows = data?.suppliers || []

  const columns = [
    { key: 'supplier_name', label: 'Supplier', primary: true, render: (row) => <><span className="cell-title">{row.supplier_name}</span><small className="cell-sub">{row.contact_person || 'No contact person'}</small></> },
    { key: 'phone', label: 'Contact', render: (row) => <>{row.phone || '—'}<small className="cell-sub">{row.email || ''}</small></> },
    { key: 'product_count', label: 'Products', align: 'right', render: (row) => number(row.product_count) },
    { key: 'purchase_total', label: 'Purchased', align: 'right', render: (row) => <>{money(row.purchase_total)}<small className="cell-sub">{number(row.purchase_count)} orders</small></> },
    { key: 'last_purchase', label: 'Last delivery', hideMobile: true, render: (row) => date(row.last_purchase) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', label: '', actions: true, render: (row) => <button type="button" className="icon-button bordered" onClick={(event) => { event.stopPropagation(); setEditing(row) }} aria-label={`Edit ${row.supplier_name}`}><Edit3 size={15} /></button> }
  ]

  return (
    <div>
      <PageHeader eyebrow="STOCK" title="Suppliers" description="Distributors you buy stock from, with purchase history and the products they supply."
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}><Plus size={16} /> Add supplier</button>} />
      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search supplier, contact, phone..." />
          <Segmented label="Status" options={[['', 'All'], ['ACTIVE', 'Active'], ['INACTIVE', 'Inactive']]} value={status} onChange={setStatus} />
        </Toolbar>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} onRowClick={(row) => setDetailId(row.id)} empty={{ icon: Truck, title: 'No suppliers found' }} />
      </Panel>
      <SupplierDetail id={detailId} onClose={() => setDetailId(null)} onEdit={(supplier) => { setDetailId(null); setEditing(supplier) }} />
      <SupplierForm supplier={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
    </div>
  )
}

function SupplierDetail({ id, onClose, onEdit }) {
  const { data, loading, error } = useApi(id ? `/suppliers/${id}` : null)
  const supplier = data?.supplier
  return (
    <Modal open={Boolean(id)} onClose={onClose} size="lg" title={supplier?.supplier_name || 'Supplier'} subtitle={supplier?.contact_person || ''}
      footer={supplier && <button type="button" className="btn btn-primary" onClick={() => onEdit(supplier)}><Edit3 size={16} /> Edit supplier</button>}>
      {loading && !data && <Loader />}
      <ErrorBanner error={error} />
      {supplier && (
        <div className="stack">
          <DetailList items={[['Status', <StatusBadge key="s" value={supplier.status} />], ['Phone', supplier.phone], ['Email', supplier.email], ['Address', supplier.address], supplier.notes && ['Notes', supplier.notes]]} />
          <div className="two-col">
            <div>
              <h3 className="section-title">Recent purchases</h3>
              <div className="list">
                {data.purchases.length ? data.purchases.map((purchase) => (
                  <div className="list-row" key={purchase.id}><div><strong>{purchase.reference_number}</strong><small>{date(purchase.purchase_date)}</small></div><div className="list-row-end"><strong>{money(purchase.total)}</strong><StatusBadge value={purchase.payment_status} /></div></div>
                )) : <p className="muted-text">No purchases yet.</p>}
              </div>
            </div>
            <div>
              <h3 className="section-title">Products supplied ({data.products.length})</h3>
              <div className="list">
                {data.products.length ? data.products.map((product) => (
                  <div className="list-row" key={product.id}><div><strong>{product.product_name}</strong><small>{product.product_code} · cost {money(product.cost_price)}</small></div><span className="muted-text">{number(product.stock_quantity)} on hand</span></div>
                )) : <p className="muted-text">No products linked.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function SupplierForm({ supplier, onClose, onSaved }) {
  const notify = useToast()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (supplier) { setForm(Object.fromEntries(Object.keys(EMPTY).map((key) => [key, supplier[key] ?? EMPTY[key]]))); setError('') } }, [supplier])
  const isNew = !supplier?.id
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (isNew) await api.post('/suppliers', form)
      else await api.put(`/suppliers/${supplier.id}`, form)
      notify(isNew ? 'Supplier added.' : 'Supplier updated.')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(supplier)} onClose={onClose} size="md" title={isNew ? 'Add supplier' : 'Edit supplier'}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="supplier-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save supplier'}</button></>}>
      <form id="supplier-form" className="form-grid" onSubmit={save}>
        <Field label="Supplier name" required full><input value={form.supplier_name} onChange={set('supplier_name')} required autoFocus /></Field>
        <Field label="Contact person"><input value={form.contact_person} onChange={set('contact_person')} /></Field>
        <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Status"><select value={form.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
        <Field label="Address" full><input value={form.address} onChange={set('address')} /></Field>
        <Field label="Notes" full><textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Payment terms, delivery schedule..." /></Field>
        {error && <div className="alert alert-error field-full">{error}</div>}
      </form>
    </Modal>
  )
}
