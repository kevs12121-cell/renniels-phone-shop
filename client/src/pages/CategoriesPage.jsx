import { useEffect, useState } from 'react'
import { Edit3, Plus, Tags } from 'lucide-react'
import { DataTable, Field, Modal, PageHeader, Panel, StatusBadge } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { money, moneyShort, number } from '../utils/format'

export default function CategoriesPage() {
  const { data, loading, error, reload } = useApi('/categories')
  const [editing, setEditing] = useState(null)
  const rows = data?.categories || []
  const totals = rows.reduce((sum, row) => ({ products: sum.products + Number(row.active_products), units: sum.units + Number(row.units_on_hand), value: sum.value + Number(row.retail_value) }), { products: 0, units: 0, value: 0 })

  const columns = [
    { key: 'category_name', label: 'Category', primary: true, render: (row) => <><span className="cell-title">{row.category_name}</span><small className="cell-sub">{row.description || 'No description'}</small></> },
    { key: 'active_products', label: 'Active products', align: 'right', render: (row) => number(row.active_products) },
    { key: 'units_on_hand', label: 'Units on hand', align: 'right', render: (row) => number(row.units_on_hand) },
    { key: 'retail_value', label: 'Retail value', align: 'right', render: (row) => money(row.retail_value) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', label: '', actions: true, render: (row) => <button type="button" className="icon-button bordered" onClick={(event) => { event.stopPropagation(); setEditing(row) }} aria-label={`Edit ${row.category_name}`}><Edit3 size={15} /></button> }
  ]

  return (
    <div>
      <PageHeader eyebrow="STOCK" title="Categories" description="Group products for the POS filter, reports and stock valuation."
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditing({ category_name: '', description: '', status: 'ACTIVE' })}><Plus size={16} /> Add category</button>} />
      <div className="summary-strip">
        <div><span>Categories</span><strong>{number(rows.length)}</strong></div>
        <div><span>Active products</span><strong>{number(totals.products)}</strong></div>
        <div><span>Units on hand</span><strong>{number(totals.units)}</strong></div>
        <div><span>Retail value</span><strong>{moneyShort(totals.value)}</strong></div>
      </div>
      <Panel flush>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} onRowClick={setEditing} empty={{ icon: Tags, title: 'No categories yet' }} />
      </Panel>
      <CategoryForm category={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
    </div>
  )
}

function CategoryForm({ category, onClose, onSaved }) {
  const notify = useToast()
  const [form, setForm] = useState({ category_name: '', description: '', status: 'ACTIVE' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (category) { setForm({ category_name: category.category_name || '', description: category.description || '', status: category.status || 'ACTIVE' }); setError('') } }, [category])
  const isNew = !category?.id

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (isNew) await api.post('/categories', form)
      else await api.put(`/categories/${category.id}`, form)
      notify(isNew ? 'Category created.' : 'Category updated.')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(category)} onClose={onClose} size="sm" title={isNew ? 'Add category' : 'Edit category'}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="category-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button></>}>
      <form id="category-form" className="form-grid" onSubmit={save}>
        <Field label="Name" required full><input value={form.category_name} onChange={(event) => setForm({ ...form, category_name: event.target.value })} required autoFocus /></Field>
        <Field label="Description" full><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        <Field label="Status" full><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
        {error && <div className="alert alert-error field-full">{error}</div>}
      </form>
    </Modal>
  )
}
