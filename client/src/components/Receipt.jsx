import { useAuth } from '../context/AuthContext'
import { PAYMENT_LABELS, dateTime, money, number, unitIdentifier } from '../utils/format'

/** Thermal-style receipt. Wrapped in .print-area so window.print() prints only the receipt. */
export default function Receipt({ sale, items, payments = [], settings: override, printable = true }) {
  const auth = useAuth()
  const settings = override || auth.settings
  const payment = payments[0]
  const lineDiscounts = items.reduce((sum, item) => sum + Number(item.discount || 0), 0)
  return (
    <div className={`receipt ${printable ? 'print-area' : ''}`}>
      <div className="receipt-header">
        <strong>{settings.business_name || 'Renniels Phone Shop'}</strong>
        {settings.business_address && <span>{settings.business_address}</span>}
        {(settings.business_phone || settings.business_email) && <span>{[settings.business_phone, settings.business_email].filter(Boolean).join(' · ')}</span>}
        {settings.tax_id && <span>TIN {settings.tax_id}</span>}
      </div>
      <div className="receipt-meta">
        <div><span>Invoice</span><b>{sale.invoice_number}</b></div>
        <div><span>Date</span><b>{dateTime(sale.sale_date)}</b></div>
        <div><span>Cashier</span><b>{sale.cashier || '—'}</b></div>
        <div><span>Customer</span><b>{sale.customer || 'Walk-in Customer'}</b></div>
      </div>
      <div className="receipt-items">
        {items.map((item) => (
          <div className="receipt-item" key={item.id}>
            <div className="receipt-line"><span>{item.product_name}</span><b>{money(item.subtotal)}</b></div>
            <small>{number(item.quantity)} × {money(item.unit_price)}{Number(item.discount) > 0 ? ` · less ${money(item.discount)}` : ''}</small>
            {(item.imei || item.serial_number) && <small>{unitIdentifier(item)}{item.warranty_until ? ` · Warranty until ${item.warranty_until}` : ''}</small>}
          </div>
        ))}
      </div>
      <div className="receipt-totals">
        <div className="receipt-line"><span>Subtotal</span><b>{money(Number(sale.subtotal) + lineDiscounts)}</b></div>
        {(Number(sale.discount) > 0 || lineDiscounts > 0) && <div className="receipt-line"><span>Discount</span><b>-{money(Number(sale.discount) + lineDiscounts)}</b></div>}
        <div className="receipt-line receipt-total"><span>TOTAL</span><b>{money(sale.total)}</b></div>
        {payment && <div className="receipt-line"><span>{PAYMENT_LABELS[payment.payment_method]}{payment.reference_number ? ` (${payment.reference_number})` : ''}</span><b>{money(payment.payment_method === 'CASH' ? sale.amount_tendered : payment.amount)}</b></div>}
        {payment?.payment_method === 'CASH' && <div className="receipt-line"><span>Change</span><b>{money(sale.change_due)}</b></div>}
      </div>
      {sale.status !== 'COMPLETED' && <div className="receipt-void">{sale.status}</div>}
      <p className="receipt-footer">{settings.receipt_footer || 'Thank you for shopping with us.'}</p>
      <p className="receipt-footer small">This serves as your official proof of purchase. Keep it for warranty claims.</p>
    </div>
  )
}
