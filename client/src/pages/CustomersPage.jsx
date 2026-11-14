import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Edit3, UserPlus, Users } from 'lucide-react'
import SaleDetailModal from '../components/SaleDetailModal'
import { DataTable, DetailList, ErrorBanner, Field, Loader, Modal, PageHeader, Panel, SearchInput, Segmented, StatusBadge, Toolbar } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { useApi, useDebounce } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { date, dateTime, money, number, relativeTime } from '../utils/format'

const EMPTY = { full_name: '', phone: '', email: '', address: '', notes: '', status: 'ACTIVE' }

export default function CustomersPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [detailId, setDetailId] = useState(null)
  const [editing, setEditing] = useState(params.get('new') ? { ...EMPTY } : null)
  const debounced = useDebounce(search)
  const { data, loading, error, reload } = useApi('/customers', { search: debounced, status })
  const rows = data?.customers || []

  function closeForm() {
    setEditing(null)
    if (params.get('new')) setParams({}, { replace: true })
  }

  const columns = [
    { key: 'full_name', label: 'Customer', primary: true, render: (row) => <><span className="cell-title">{row.full_name}</span><small className="cell-sub">{row.customer_code}</small></> },
    { key: 'phone', label: 'Contact', render: (row) => <>{row.phone || '—'}<small className="cell-sub">{row.email || ''}</small></> },
    { key: 'purchases', label: 'Purchases', align: 'right', render: (row) => number(row.purchases) },
    { key: 'total_spent', label: 'Total spent', align: 'right', render: (row) => <strong>{money(row.total_spent)}</strong> },
    { key: 'last_purchase', label: 'Last visit', hideMobile: true, render: (row) => (row.last_purchase ? relativeTime(row.last_purchase) : 'No purchases') },
    { key: 'status', label: 'Status', hideMobile: true, render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', label: '', actions: true, render: (row) => <button type="button" className="icon-button bordered" onClick={(event) => { event.stopPropagation(); setEditing(row) }} aria-label={`Edit ${row.full_name}`}><Edit3 size={15} /></button> }
  ]

  return (
    <div>
      <PageHeader eyebrow="PEOPLE" title="Customers" description="Registered customers for warranty tracking, purchase history and repeat business."
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}><UserPlus size={16} /> Add customer</button>} />
      <div className="summary-strip">
        <div><span>Customers</span><strong>{number(rows.length)}</strong></div>
        <div><span>Total spent</span><strong>{money(rows.reduce((sum, row) => sum + Number(row.total_spent), 0))}</strong></div>
        <div><span>Repeat buyers</span><strong>{number(rows.filter((row) => Number(row.purchases) > 1).length)}</strong></div>
        <div><span>Avg. per customer</span><strong>{money(rows.length ? rows.reduce((sum, row) => sum + Number(row.total_spent), 0) / rows.length : 0)}</strong></div>
      </div>
      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, code, phone, email..." />
          <Segmented label="Status" options={[['ACTIVE', 'Active'], ['INACTIVE', 'Inactive'], ['', 'All']]} value={status} onChange={setStatus} />
        </Toolbar>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} onRowClick={(row) => setDetailId(row.id)} empty={{ icon: Users, title: 'No customers found' }} />
      </Panel>
      <CustomerDetail id={detailId} onClose={() => setDetailId(null)} onEdit={(customer) => { setDetailId(null); setEditing(customer) }} />
      <CustomerForm customer={editing} onClose={closeForm} onSaved={() => { closeForm(); reload() }} />
    </div>
  )
}

function CustomerDetail({ id, onClose, onEdit }) {
  const { data, loading, error } = useApi(id ? `/customers/${id}` : null)
  const [saleId, setSaleId] = useState(null)
  const customer = data?.customer
  return (
    <>
      <Modal open={Boolean(id)} onClose={onClose} size="lg" title={customer?.full_name || 'Customer'} subtitle={customer ? `${customer.customer_code} · customer since ${date(customer.created_at)}` : ''}
        footer={customer && <button type="button" className="btn btn-primary" onClick={() => onEdit(customer)}><Edit3 size={16} /> Edit customer</button>}>
        {loading && !data && <Loader />}
        <ErrorBanner error={error} />
        {customer && (
          <div className="stack">
            <div className="mini-stats">
              <div><span>Purchases</span><strong>{number(customer.purchases)}</strong></div>
              <div><span>Total spent</span><strong>{money(customer.total_spent)}</strong></div>
              <div><span>Status</span><strong><StatusBadge value={customer.status} /></strong></div>
            </div>
            <DetailList items={[['Phone', customer.phone], ['Email', customer.email], ['Address', customer.address], customer.notes && ['Notes', customer.notes]]} />
            <div>
              <h3 className="section-title">Purchase history</h3>
              <div className="list">
                {data.sales.length ? data.sales.map((sale) => (
                  <button type="button" className="list-row clickable" key={sale.id} onClick={() => setSaleId(sale.id)}>
                    <div><strong>{sale.invoice_number}</strong><small>{dateTime(sale.sale_date)} · {sale.cashier} · {sale.items}</small></div>
                    <div className="list-row-end"><strong>{money(sale.total)}</strong>{sale.status !== 'COMPLETED' && <StatusBadge value={sale.status} />}</div>
                  </button>
                )) : <p className="muted-text">No purchases yet.</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>
      <SaleDetailModal saleId={saleId} onClose={() => setSaleId(null)} />
    </>
  )
}

function CustomerForm({ customer, onClose, onSaved }) {
  const notify = useToast()
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (customer) { setForm(Object.fromEntries(Object.keys(EMPTY).map((key) => [key, customer[key] ?? EMPTY[key]]))); setError('') } }, [customer])
  const isNew = !customer?.id
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (isNew) await api.post('/customers', form)
      else await api.put(`/customers/${customer.id}`, form)
      notify(isNew ? 'Customer added.' : 'Customer updated.')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(customer)} onClose={onClose} size="md" title={isNew ? 'Add customer' : 'Edit customer'} subtitle={customer?.customer_code}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="customer-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save customer'}</button></>}>
      <form id="customer-form" className="form-grid" onSubmit={save}>
        <Field label="Full name" required full><input value={form.full_name} onChange={set('full_name')} required autoFocus /></Field>
        <Field label="Mobile number"><input value={form.phone} onChange={set('phone')} placeholder="+63 9XX XXX XXXX" /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Address" full><input value={form.address} onChange={set('address')} /></Field>
        <Field label="Notes" full><textarea rows={2} value={form.notes} onChange={set('notes')} /></Field>
        {!isNew && <Field label="Status"><select value={form.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>}
        {error && <div className="alert alert-error field-full">{error}</div>}
      </form>
    </Modal>
  )
}
