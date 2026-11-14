import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import Receipt from '../components/Receipt'
import { Field, PageHeader, Panel } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import api, { errorMessage } from '../services/api'

const FIELDS = [
  ['business_name', 'Business name', true],
  ['business_phone', 'Phone'],
  ['business_email', 'Email'],
  ['tax_id', 'TIN / tax ID'],
  ['business_address', 'Address', false, true],
  ['receipt_footer', 'Receipt footer message', false, true]
]

const SAMPLE_SALE = { invoice_number: 'INV-SAMPLE-00001', sale_date: new Date().toISOString(), cashier: 'Maria Santos', customer: 'Walk-in Customer', subtotal: 10388, discount: 100, total: 10288, amount_tendered: 10500, change_due: 212, status: 'COMPLETED' }
const SAMPLE_ITEMS = [
  { id: 1, product_name: 'Samsung Galaxy A15 8GB/128GB', quantity: 1, unit_price: 9990, discount: 0, subtotal: 9990, imei: '351024913460619', warranty_until: '2027-11-14' },
  { id: 2, product_name: 'Galaxy A15 Tempered Glass', quantity: 2, unit_price: 149, discount: 0, subtotal: 298 },
  { id: 3, product_name: 'Galaxy A15 Silicone Case', quantity: 1, unit_price: 249, discount: 149, subtotal: 100 }
]

export default function SettingsPage() {
  const { settings, setSettings } = useAuth()
  const notify = useToast()
  const [form, setForm] = useState(settings)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setForm(settings) }, [settings])

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await api.put('/settings', form)
      setSettings({ ...settings, ...form })
      notify('Settings saved.')
    } catch (err) {
      notify(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader eyebrow="ADMINISTRATION" title="Business settings" description="Shown on printed receipts and across the workspace." />
      <div className="settings-layout">
        <Panel title="Business details">
          <form className="form-grid" onSubmit={save}>
            {FIELDS.map(([key, label, required, full]) => (
              <Field key={key} label={label} required={required} full={full}>
                {key === 'receipt_footer' || key === 'business_address'
                  ? <textarea rows={2} value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
                  : <input value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={required} />}
              </Field>
            ))}
            <div className="field-full form-actions"><button type="submit" className="btn btn-primary" disabled={busy}><Save size={16} /> {busy ? 'Saving...' : 'Save settings'}</button></div>
          </form>
        </Panel>
        <Panel title="Receipt preview" className="receipt-preview">
          <Receipt sale={SAMPLE_SALE} items={SAMPLE_ITEMS} payments={[{ payment_method: 'CASH', amount: 10288 }]} settings={{ ...settings, ...form }} printable={false} />
        </Panel>
      </div>
    </div>
  )
}
