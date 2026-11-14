import { useEffect, useState } from 'react'
import { Edit3, Package, Plus, Smartphone } from 'lucide-react'
import { DataTable, DetailList, ErrorBanner, Field, Loader, Modal, PageHeader, Panel, SearchInput, Segmented, StatusBadge, Toolbar } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi, useDebounce } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { MOVEMENT_LABELS, date, dateTime, money, number, percent } from '../utils/format'

const STOCK_FILTERS = [['', 'All'], ['IN', 'In stock'], ['LOW', 'Low'], ['OUT', 'Out']]
const EMPTY_PRODUCT = { product_code: '', product_name: '', category_id: '', supplier_id: '', brand: '', model: '', storage: '', ram: '', color: '', description: '', cost_price: '', selling_price: '', reorder_level: '', is_serialized: false, status: 'ACTIVE' }

export function stockStatus(product) {
  const stock = Number(product.stock_quantity)
  return stock <= 0 ? 'OUT OF STOCK' : stock <= Number(product.reorder_level) ? 'LOW STOCK' : 'IN STOCK'
}

export default function ProductsPage() {
  const { isOwner } = useAuth()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [stock, setStock] = useState('')
  const [status, setStatus] = useState('ACTIVE')
  const [detailId, setDetailId] = useState(null)
  const [editing, setEditing] = useState(null)
  const debounced = useDebounce(search)
  const { data, loading, error, reload } = useApi('/products', { search: debounced, category_id: categoryId, stock, status: isOwner ? status : 'ACTIVE' })
  const categories = useApi('/categories')
  const rows = data?.products || []

  const columns = [
    { key: 'product_name', label: 'Product', primary: true, render: (row) => <><span className="cell-title">{row.is_serialized ? <Smartphone size={13} className="inline-icon" /> : null}{row.product_name}</span><small className="cell-sub">{row.product_code}{row.brand ? ` · ${row.brand}` : ''}</small></> },
    { key: 'category_name', label: 'Category' },
    { key: 'selling_price', label: 'Price', align: 'right', render: (row) => <strong>{money(row.selling_price)}</strong> },
    isOwner && { key: 'cost_price', label: 'Cost', align: 'right', hideMobile: true, render: (row) => <>{money(row.cost_price)}<small className="cell-sub">{Number(row.selling_price) > 0 ? `${percent((row.selling_price - row.cost_price) / row.selling_price, 0)} margin` : ''}</small></> },
    { key: 'stock_quantity', label: 'Stock', align: 'right', render: (row) => <><strong>{number(row.stock_quantity)}</strong><small className="cell-sub">reorder {number(row.reorder_level)}</small></> },
    { key: 'stock_status', label: 'Availability', render: (row) => row.status === 'INACTIVE' ? <StatusBadge value="INACTIVE" /> : <StatusBadge value={stockStatus(row)} /> },
    isOwner && { key: 'actions', label: '', actions: true, render: (row) => <button type="button" className="icon-button bordered" onClick={(event) => { event.stopPropagation(); setEditing(row) }} aria-label={`Edit ${row.product_name}`}><Edit3 size={15} /></button> }
  ].filter(Boolean)

  return (
    <div>
      <PageHeader eyebrow="STOCK" title="Products" description={isOwner ? 'Your catalog of phones, tablets and accessories with prices, margins and stock levels.' : 'Check prices, stock levels and available IMEI units.'}
        actions={isOwner && <button type="button" className="btn btn-primary" onClick={() => setEditing({ ...EMPTY_PRODUCT })}><Plus size={16} /> Add product</button>} />
      <Panel flush>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, SKU, brand..." />
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {(categories.data?.categories || []).map((category) => <option key={category.id} value={category.id}>{category.category_name}</option>)}
          </select>
          <Segmented label="Stock" options={STOCK_FILTERS} value={stock} onChange={setStock} />
          {isOwner && <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="">All</option></select>}
        </Toolbar>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} onRowClick={(row) => setDetailId(row.id)} pageSize={20}
          empty={{ icon: Package, title: 'No products found', text: 'Try a different search or filter.' }} />
      </Panel>

      <ProductDetail id={detailId} onClose={() => setDetailId(null)} onEdit={(product) => { setDetailId(null); setEditing(product) }} />
      <ProductForm product={editing} categories={categories.data?.categories || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
    </div>
  )
}

function ProductDetail({ id, onClose, onEdit }) {
  const { isOwner } = useAuth()
  const { data, loading, error } = useApi(id ? `/products/${id}` : null)
  const product = data?.product
  const units = data?.units || []
  const inStock = units.filter((unit) => unit.unit_status === 'IN_STOCK')
  const [showAll, setShowAll] = useState(false)
  useEffect(() => setShowAll(false), [id])
  const visibleUnits = showAll ? units : inStock

  return (
    <Modal open={Boolean(id)} onClose={onClose} size="lg" title={product?.product_name || 'Product'} subtitle={product ? `${product.product_code} · ${product.category_name}` : ''}
      footer={isOwner && product && <button type="button" className="btn btn-primary" onClick={() => onEdit(product)}><Edit3 size={16} /> Edit product</button>}>
      {loading && !data && <Loader />}
      <ErrorBanner error={error} />
      {product && (
        <div className="stack">
          <div className="mini-stats">
            <div><span>Price</span><strong>{money(product.selling_price)}</strong></div>
            {isOwner && <div><span>Cost</span><strong>{money(product.cost_price)}</strong></div>}
            <div><span>In stock</span><strong>{number(product.stock_quantity)}</strong></div>
            <div><span>Sold (30 days)</span><strong>{number(product.sold_30d)}</strong></div>
          </div>
          <DetailList items={[
            ['Availability', <StatusBadge key="s" value={product.status === 'INACTIVE' ? 'INACTIVE' : stockStatus(product)} />],
            ['Brand / model', [product.brand, product.model].filter(Boolean).join(' ') || '—'],
            ['Specs', [product.ram && `${product.ram} RAM`, product.storage, product.color].filter(Boolean).join(' · ') || '—'],
            ['Supplier', product.supplier_name],
            ['Reorder level', number(product.reorder_level)],
            ['Tracking', product.is_serialized ? 'IMEI / serial per unit' : 'Quantity only'],
            product.description && ['Description', product.description]
          ]} />

          {Boolean(product.is_serialized) && (
            <div>
              <div className="section-head">
                <h3 className="section-title">Units ({inStock.length} in stock)</h3>
                <button type="button" className="text-button" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show in-stock only' : `Show all ${units.length}`}</button>
              </div>
              <div className="table-wrap compact-table">
                <table className="data-table">
                  <thead><tr><th>IMEI / Serial</th><th>Status</th><th>Received</th><th>Sold on</th></tr></thead>
                  <tbody>
                    {visibleUnits.slice(0, 60).map((unit) => (
                      <tr key={unit.id}>
                        <td data-label="IMEI / Serial" className="cell-primary"><span className="cell-title mono">{unit.imei || unit.serial_number}</span>{unit.imei2 && <small className="cell-sub mono">IMEI 2: {unit.imei2}</small>}</td>
                        <td data-label="Status"><StatusBadge value={unit.unit_status} /></td>
                        <td data-label="Received">{unit.purchase_reference || '—'}<small className="cell-sub">{date(unit.created_at)}</small></td>
                        <td data-label="Sold on">{unit.sale_reference || '—'}{unit.warranty_until && <small className="cell-sub">Warranty to {date(unit.warranty_until)}</small>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h3 className="section-title">Recent stock movements</h3>
            <div className="list">
              {(data.movements || []).slice(0, 10).map((movement) => (
                <div className="list-row" key={movement.id}>
                  <div><strong>{MOVEMENT_LABELS[movement.movement_type]} {Number(movement.quantity) > 0 ? '+' : ''}{number(movement.quantity)}</strong><small>{dateTime(movement.created_at)} · {movement.performed_by || 'System'} · {movement.remarks}</small></div>
                  <span className="muted-text">{number(movement.previous_quantity)} → {number(movement.new_quantity)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ProductForm({ product, categories, onClose, onSaved }) {
  const notify = useToast()
  const suppliers = useApi(product ? '/suppliers' : null, { status: 'ACTIVE' })
  const [form, setForm] = useState(EMPTY_PRODUCT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!product) return
    const pick = (value) => (value === null || value === undefined ? '' : value)
    setForm(Object.fromEntries(Object.keys(EMPTY_PRODUCT).map((key) => [key, key === 'is_serialized' ? Boolean(product[key]) : pick(product[key])])))
    setError('')
  }, [product])

  const isNew = !product?.id
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value })
  const margin = Number(form.selling_price) > 0 ? (Number(form.selling_price) - Number(form.cost_price || 0)) / Number(form.selling_price) : null

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (isNew) await api.post('/products', form)
      else await api.put(`/products/${product.id}`, form)
      notify(isNew ? 'Product created.' : 'Product updated.')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(product)} onClose={onClose} size="lg" title={isNew ? 'Add product' : `Edit ${product?.product_name}`} subtitle={isNew ? 'New products start with zero stock. Receive stock through Purchases.' : product?.product_code}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="product-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save product'}</button></>}>
      <form id="product-form" className="form-grid" onSubmit={save}>
        <Field label="Product name" required full><input value={form.product_name} onChange={set('product_name')} required placeholder="e.g. Samsung Galaxy A15 8GB/128GB" /></Field>
        <Field label="SKU / product code" required><input value={form.product_code} onChange={set('product_code')} required placeholder="SM-A15-128" /></Field>
        <Field label="Category" required>
          <select value={form.category_id} onChange={set('category_id')} required><option value="">Choose...</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.category_name}</option>)}</select>
        </Field>
        <Field label="Brand"><input value={form.brand} onChange={set('brand')} /></Field>
        <Field label="Model"><input value={form.model} onChange={set('model')} /></Field>
        <Field label="RAM"><input value={form.ram} onChange={set('ram')} placeholder="8GB" /></Field>
        <Field label="Storage"><input value={form.storage} onChange={set('storage')} placeholder="128GB" /></Field>
        <Field label="Color"><input value={form.color} onChange={set('color')} /></Field>
        <Field label="Default supplier">
          <select value={form.supplier_id} onChange={set('supplier_id')}><option value="">None</option>{(suppliers.data?.suppliers || []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select>
        </Field>
        <Field label="Cost price (₱)" required><input type="number" min="0" step="0.01" value={form.cost_price} onChange={set('cost_price')} required /></Field>
        <Field label="Selling price (₱)" required hint={margin !== null ? `Margin ${percent(margin)}` : undefined}><input type="number" min="0" step="0.01" value={form.selling_price} onChange={set('selling_price')} required /></Field>
        <Field label="Reorder level" hint="Alert when stock falls to this level"><input type="number" min="0" step="1" value={form.reorder_level} onChange={set('reorder_level')} /></Field>
        <Field label="Status"><select value={form.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive (hidden from POS)</option></select></Field>
        <Field label="Description" full><textarea rows={2} value={form.description} onChange={set('description')} /></Field>
        <label className="checkbox-field field-full">
          <input type="checkbox" checked={form.is_serialized} onChange={set('is_serialized')} disabled={!isNew && Number(product?.stock_quantity) !== 0} />
          <span><strong>Track each unit by IMEI / serial number</strong><small>For phones and tablets. {!isNew && Number(product?.stock_quantity) !== 0 ? 'Can only change while stock is zero.' : ''}</small></span>
        </label>
        {error && <div className="alert alert-error field-full">{error}</div>}
      </form>
    </Modal>
  )
}
