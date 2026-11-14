import { useEffect, useMemo, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, Landmark, Minus, Package, Plus, Printer, ScanLine, ShoppingCart, Smartphone, Trash2, UserPlus, Wallet, X } from 'lucide-react'
import Receipt from '../components/Receipt'
import { EmptyState, ErrorBanner, Field, Loader, Modal, SearchInput } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi, useDebounce } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { PAYMENT_LABELS, money, number, unitIdentifier } from '../utils/format'

const CART_KEY = 'renniels_pos_cart'
const METHODS = [['CASH', Banknote], ['GCASH', Wallet], ['CARD', CreditCard], ['BANK_TRANSFER', Landmark], ['OTHER', Smartphone]]

function loadCart() {
  try { return JSON.parse(sessionStorage.getItem(CART_KEY)) || [] } catch { return [] }
}

export default function PosPage() {
  const { isOwner } = useAuth()
  const notify = useToast()
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const debounced = useDebounce(search, 250)
  const products = useApi('/products', { available: '1', search: debounced, category_id: categoryId })
  const categories = useApi('/categories')
  const customers = useApi('/customers', { status: 'ACTIVE' })

  const [cart, setCart] = useState(loadCart)
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState('')
  const [method, setMethod] = useState('CASH')
  const [tendered, setTendered] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [unitPicker, setUnitPicker] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState(null)
  const [completed, setCompleted] = useState(null)

  useEffect(() => { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)) }, [cart])
  useEffect(() => { document.body.classList.toggle('cart-drawer-open', cartOpen); return () => document.body.classList.remove('cart-drawer-open') }, [cartOpen])

  const subtotal = cart.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)
  const discountValue = Math.min(Number(discount) || 0, subtotal)
  const total = Math.max(0, subtotal - discountValue)
  const tenderedValue = method === 'CASH' ? (tendered === '' ? total : Number(tendered)) : total
  const change = Math.max(0, tenderedValue - total)
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const maxCashierDiscount = Math.floor(subtotal * 0.1)
  const quickCash = useMemo(() => {
    const options = new Set([total])
    for (const step of [100, 500, 1000]) options.add(Math.ceil((total + 0.01) / step) * step)
    return [...options].filter((value) => value > 0).sort((a, b) => a - b).slice(0, 4)
  }, [total])

  function addProduct(product) {
    if (product.is_serialized) {
      setUnitPicker(product)
      return
    }
    setCart((current) => {
      const existing = current.find((line) => line.product_id === product.id && !line.unit)
      const stock = Number(product.stock_quantity)
      if (existing) {
        if (existing.quantity >= stock) { notify(`Only ${number(stock)} in stock for ${product.product_name}.`, 'error'); return current }
        return current.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1, max: stock } : line))
      }
      return [...current, { key: `p-${product.id}`, product_id: product.id, product_name: product.product_name, product_code: product.product_code, unit_price: Number(product.selling_price), quantity: 1, max: stock, unit: null }]
    })
  }

  function addUnits(product, units) {
    setCart((current) => [
      ...current,
      ...units.filter((unit) => !current.some((line) => line.unit?.id === unit.id)).map((unit) => ({
        key: `u-${unit.id}`, product_id: product.id, product_name: product.product_name, product_code: product.product_code,
        unit_price: Number(unit.selling_price) || Number(product.selling_price), quantity: 1, max: 1, unit: { id: unit.id, imei: unit.imei, serial_number: unit.serial_number }
      }))
    ])
    setUnitPicker(null)
  }

  function changeQuantity(line, delta) {
    setCart((current) => current.map((entry) => (entry.key === line.key ? { ...entry, quantity: Math.min(entry.max, Math.max(1, entry.quantity + delta)) } : entry)))
  }

  function clearSale() {
    setCart([])
    setCustomerId('')
    setDiscount('')
    setTendered('')
    setReference('')
    setNotes('')
    setMethod('CASH')
    setError('')
  }

  function onSearchKey(event) {
    if (event.key !== 'Enter') return
    const list = products.data?.products || []
    const exact = list.find((product) => product.product_code.toLowerCase() === search.trim().toLowerCase())
    const target = exact || (list.length === 1 ? list[0] : null)
    if (target) { addProduct(target); setSearch('') }
  }

  async function checkout() {
    setError('')
    if (!cart.length) return
    if (method === 'CASH' && tenderedValue < total) { setError('Cash received is less than the total.'); return }
    if (!['CASH', 'OTHER'].includes(method) && !reference.trim()) { setError('Enter the payment reference number.'); return }
    setBusy(true)
    try {
      const { data } = await api.post('/sales', {
        customer_id: customerId || null,
        items: cart.map((line) => ({ product_id: line.product_id, quantity: line.quantity, product_unit_id: line.unit?.id })),
        discount: discountValue,
        payment_method: method,
        amount_tendered: tenderedValue,
        reference_number: reference.trim() || null,
        notes: notes.trim() || null
      })
      const detail = await api.get(`/sales/${data.id}`)
      setCompleted(detail.data)
      clearSale()
      setCartOpen(false)
      products.reload()
      notify(`Sale ${data.invoice_number} completed.`)
    } catch (err) {
      setError(errorMessage(err))
      products.reload()
    } finally {
      setBusy(false)
    }
  }

  const productList = products.data?.products || []

  return (
    <div className="pos">
      <section className="pos-catalog">
        <div className="pos-head">
          <div>
            <p className="eyebrow">POINT OF SALE</p>
            <h1>New sale</h1>
          </div>
          <div className="pos-search" onKeyDown={onSearchKey}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, brand or scan SKU..." />
          </div>
        </div>
        <div className="chip-row" role="tablist" aria-label="Filter by category">
          <button type="button" className={`chip ${categoryId === '' ? 'active' : ''}`} onClick={() => setCategoryId('')}>All</button>
          {(categories.data?.categories || []).filter((category) => category.status === 'ACTIVE' && category.active_products > 0).map((category) => (
            <button type="button" key={category.id} className={`chip ${categoryId === category.id ? 'active' : ''}`} onClick={() => setCategoryId(category.id)}>{category.category_name}</button>
          ))}
        </div>
        <ErrorBanner error={products.error} onRetry={products.reload} />
        {products.loading && !products.data ? <Loader label="Loading products..." /> : productList.length === 0 ? (
          <EmptyState icon={Package} title="No products available" text={search ? 'No in-stock product matches your search.' : 'Receive stock in Purchases to start selling.'} />
        ) : (
          <div className="product-grid">
            {productList.map((product) => {
              const inCart = cart.filter((line) => line.product_id === product.id).reduce((sum, line) => sum + line.quantity, 0)
              const remaining = Number(product.stock_quantity) - inCart
              const low = Number(product.stock_quantity) <= Number(product.reorder_level)
              return (
                <button type="button" key={product.id} className={`product-tile ${inCart ? 'in-cart' : ''}`} onClick={() => addProduct(product)} disabled={remaining <= 0}>
                  <span className="product-tile-top">
                    <span className="product-icon">{product.is_serialized ? <Smartphone size={18} /> : <Package size={18} />}</span>
                    {inCart > 0 && <span className="tile-count">{inCart}</span>}
                  </span>
                  <strong>{product.product_name}</strong>
                  <small>{product.category_name}{product.is_serialized ? ' · IMEI' : ''}</small>
                  <span className="product-tile-foot">
                    <b>{money(product.selling_price)}</b>
                    <em className={low ? 'low' : ''}>{remaining > 0 ? `${number(remaining)} left` : 'In cart'}</em>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <aside className={`pos-cart ${cartOpen ? 'open' : ''}`} aria-label="Cart">
        <div className="cart-head">
          <div><h2>Current sale</h2><small>{itemCount} item{itemCount === 1 ? '' : 's'}</small></div>
          <div className="cart-head-actions">
            {cart.length > 0 && <button type="button" className="text-button danger" onClick={clearSale}>Clear</button>}
            <button type="button" className="icon-button cart-close" onClick={() => setCartOpen(false)} aria-label="Close cart"><X size={18} /></button>
          </div>
        </div>

        <div className="cart-customer">
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} aria-label="Customer">
            <option value="">Walk-in customer</option>
            {(customers.data?.customers || []).map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
          </select>
          <button type="button" className="icon-button bordered" onClick={() => setNewCustomer({ full_name: '', phone: '', email: '' })} aria-label="Add new customer" title="Add new customer"><UserPlus size={17} /></button>
        </div>

        <div className="cart-lines">
          {cart.length === 0 ? (
            <div className="cart-empty"><ScanLine size={26} /><strong>Cart is empty</strong><span>Tap a product or scan a SKU to add it.</span></div>
          ) : cart.map((line) => (
            <div className="cart-line" key={line.key}>
              <div className="cart-line-info">
                <strong>{line.product_name}</strong>
                <small>{line.unit ? unitIdentifier(line.unit) : `${money(line.unit_price)} each`}</small>
              </div>
              <div className="cart-line-controls">
                {line.unit ? <span className="qty-fixed">1</span> : (
                  <div className="qty">
                    <button type="button" onClick={() => changeQuantity(line, -1)} disabled={line.quantity <= 1} aria-label="Decrease quantity"><Minus size={14} /></button>
                    <span>{line.quantity}</span>
                    <button type="button" onClick={() => changeQuantity(line, 1)} disabled={line.quantity >= line.max} aria-label="Increase quantity"><Plus size={14} /></button>
                  </div>
                )}
                <b>{money(line.unit_price * line.quantity)}</b>
                <button type="button" className="icon-button danger" onClick={() => setCart((current) => current.filter((entry) => entry.key !== line.key))} aria-label={`Remove ${line.product_name}`}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-summary">
          <div className="summary-row"><span>Subtotal</span><b>{money(subtotal)}</b></div>
          <div className="summary-row">
            <span>Discount {!isOwner && subtotal > 0 && <small>(max {money(maxCashierDiscount)})</small>}</span>
            <input className="discount-input" type="number" min="0" step="1" inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0.00" aria-label="Discount amount" />
          </div>
          <div className="summary-row total"><span>Total</span><b>{money(total)}</b></div>

          <div className="method-grid" role="radiogroup" aria-label="Payment method">
            {METHODS.map(([value, Icon]) => (
              <button type="button" key={value} role="radio" aria-checked={method === value} className={method === value ? 'active' : ''} onClick={() => { setMethod(value); setTendered('') }}>
                <Icon size={16} /><span>{PAYMENT_LABELS[value].replace(' (Maya)', '')}</span>
              </button>
            ))}
          </div>

          {method === 'CASH' ? (
            <div className="cash-box">
              <label className="summary-row"><span>Cash received</span><input type="number" min="0" inputMode="decimal" value={tendered} onChange={(event) => setTendered(event.target.value)} placeholder={total.toFixed(2)} /></label>
              <div className="quick-cash">{quickCash.map((value) => <button type="button" key={value} onClick={() => setTendered(String(value))}>{value === total ? 'Exact' : money(value).replace('.00', '')}</button>)}</div>
              <div className="summary-row change"><span>Change</span><b>{money(change)}</b></div>
            </div>
          ) : (
            <label className="summary-row"><span>{method === 'OTHER' ? 'Reference (optional)' : 'Reference no.'}</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={method === 'GCASH' ? 'GCash ref. no.' : method === 'CARD' ? 'Approval code' : 'Transaction no.'} /></label>
          )}
          <input className="notes-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes (optional)" aria-label="Sale notes" />

          {error && <div className="alert alert-error compact">{error}</div>}
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={!cart.length || busy} onClick={checkout}>
            {busy ? 'Processing...' : <>Charge {money(total)}</>}
          </button>
        </div>
      </aside>

      <button type="button" className="cart-fab" onClick={() => setCartOpen(true)}>
        <span><ShoppingCart size={18} /> {itemCount} item{itemCount === 1 ? '' : 's'}</span>
        <b>{money(total)}</b>
      </button>
      {cartOpen && <button type="button" className="backdrop cart-backdrop" onClick={() => setCartOpen(false)} aria-label="Close cart" />}

      <UnitPicker product={unitPicker} excluded={cart.filter((line) => line.unit).map((line) => line.unit.id)} onClose={() => setUnitPicker(null)} onAdd={addUnits} />

      <Modal open={Boolean(newCustomer)} onClose={() => setNewCustomer(null)} size="sm" title="Add customer" footer={
        <><button type="button" className="btn btn-ghost" onClick={() => setNewCustomer(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!newCustomer?.full_name?.trim()} onClick={async () => {
            try {
              const { data } = await api.post('/customers', newCustomer)
              await customers.reload()
              setCustomerId(String(data.id))
              setNewCustomer(null)
              notify(`Customer ${data.full_name} added.`)
            } catch (err) { notify(errorMessage(err), 'error') }
          }}>Save customer</button></>
      }>
        {newCustomer && (
          <div className="form-grid">
            <Field label="Full name" required full><input autoFocus value={newCustomer.full_name} onChange={(event) => setNewCustomer({ ...newCustomer, full_name: event.target.value })} /></Field>
            <Field label="Mobile number"><input value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} placeholder="+63 9XX XXX XXXX" /></Field>
            <Field label="Email"><input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} /></Field>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(completed)} onClose={() => setCompleted(null)} size="sm" title="Sale completed" className="receipt-modal"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => window.print()}><Printer size={16} /> Print receipt</button><button type="button" className="btn btn-primary" onClick={() => setCompleted(null)}>New sale</button></>}>
        {completed && (
          <>
            <div className="sale-success"><CheckCircle2 size={22} /><div><strong>{money(completed.sale.total)} received</strong>{completed.payments[0]?.payment_method === 'CASH' && <span>Change due: <b>{money(completed.sale.change_due)}</b></span>}</div></div>
            <Receipt sale={completed.sale} items={completed.items} payments={completed.payments} />
          </>
        )}
      </Modal>
    </div>
  )
}

function UnitPicker({ product, excluded, onClose, onAdd }) {
  const { data, loading, error } = useApi(product ? `/products/${product.id}/units` : null)
  const [selected, setSelected] = useState([])
  const [filter, setFilter] = useState('')
  useEffect(() => { setSelected([]); setFilter('') }, [product])
  const units = (data?.units || []).filter((unit) => !excluded.includes(unit.id)).filter((unit) => !filter || [unit.imei, unit.imei2, unit.serial_number].some((value) => value?.toLowerCase().includes(filter.toLowerCase())))
  const toggle = (unit) => setSelected((current) => (current.some((entry) => entry.id === unit.id) ? current.filter((entry) => entry.id !== unit.id) : [...current, unit]))

  return (
    <Modal open={Boolean(product)} onClose={onClose} title={product?.product_name || ''} subtitle="Select the exact unit(s) being sold" size="md"
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={!selected.length} onClick={() => onAdd(product, selected)}>Add {selected.length || ''} to cart</button></>}>
      <div className="stack">
        <SearchInput value={filter} onChange={setFilter} placeholder="Find IMEI / serial..." />
        <ErrorBanner error={error} />
        {loading && !data ? <Loader /> : units.length === 0 ? <EmptyState icon={Smartphone} title="No units available" text="All in-stock units are already in the cart." /> : (
          <div className="unit-list">
            {units.map((unit) => {
              const checked = selected.some((entry) => entry.id === unit.id)
              return (
                <label key={unit.id} className={`unit-option ${checked ? 'checked' : ''}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(unit)} />
                  <div>
                    <strong>{unit.imei ? unit.imei : unit.serial_number}</strong>
                    <small>{unit.imei ? `IMEI${unit.imei2 ? ` · IMEI 2 ${unit.imei2}` : ''}` : 'Serial number'} · {unit.purchase_reference}</small>
                  </div>
                  <b>{money(unit.selling_price)}</b>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
