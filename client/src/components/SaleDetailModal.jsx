import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, Printer, Receipt as ReceiptIcon, Undo2 } from 'lucide-react'
import { ConfirmDialog, DetailList, ErrorBanner, Loader, Modal, StatusBadge } from './ui'
import Receipt from './Receipt'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { PAYMENT_LABELS, dateTime, money, number, unitIdentifier } from '../utils/format'

export default function SaleDetailModal({ saleId, onClose, onChanged }) {
  const { isOwner } = useAuth()
  const notify = useToast()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi(saleId ? `/sales/${saleId}` : null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)

  const sale = data?.sale
  const items = data?.items || []
  const payments = data?.payments || []
  const returns = data?.returns || []
  const canCancel = isOwner && sale?.status === 'COMPLETED' && returns.length === 0
  const canReturn = sale?.status === 'COMPLETED' && items.some((item) => Number(item.quantity) > Number(item.returned_quantity))

  async function cancelSale(reason) {
    setBusy(true)
    try {
      await api.post(`/sales/${saleId}/cancel`, { reason })
      notify('Sale cancelled and stock restored.')
      setConfirmCancel(false)
      await reload()
      onChanged?.()
    } catch (err) {
      notify(errorMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open={Boolean(saleId)}
        onClose={onClose}
        size="lg"
        title={sale ? sale.invoice_number : 'Sale details'}
        subtitle={sale ? `${dateTime(sale.sale_date)} · ${sale.cashier || 'Unknown cashier'}` : ''}
        footer={sale && (
          <>
            {canCancel && <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmCancel(true)}><Ban size={16} /> Cancel sale</button>}
            {canReturn && <button type="button" className="btn btn-ghost" onClick={() => navigate(`/returns?sale=${sale.id}`)}><Undo2 size={16} /> Process return</button>}
            <button type="button" className="btn btn-primary" onClick={() => setShowReceipt(true)}><ReceiptIcon size={16} /> View receipt</button>
          </>
        )}
      >
        {loading && !data && <Loader />}
        <ErrorBanner error={error} onRetry={reload} />
        {sale && (
          <div className="stack">
            <DetailList items={[
              ['Status', <StatusBadge key="s" value={sale.status} />],
              ['Customer', sale.customer],
              ['Payment', payments.map((payment) => `${PAYMENT_LABELS[payment.payment_method]}${payment.reference_number ? ` · ${payment.reference_number}` : ''}`).join(', ') || '—'],
              ['Total', <strong key="t">{money(sale.total)}</strong>],
              Number(sale.discount) > 0 && ['Discount', money(sale.discount)],
              payments[0]?.payment_method === 'CASH' && ['Cash received / change', `${money(sale.amount_tendered)} / ${money(sale.change_due)}`],
              sale.notes && ['Notes', sale.notes],
              sale.status === 'CANCELLED' && ['Cancelled', `${dateTime(sale.cancelled_at)} by ${sale.cancelled_by_name || '—'}: ${sale.cancellation_reason}`]
            ]} />

            <div className="table-wrap compact-table">
              <table className="data-table">
                <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Item" className="cell-primary">
                        <span className="cell-title">{item.product_name}</span>
                        <small className="cell-sub">{item.product_code}{item.imei || item.serial_number ? ` · ${unitIdentifier(item)}` : ''}</small>
                        {Number(item.returned_quantity) > 0 && <small className="cell-sub warn">Returned: {number(item.returned_quantity)}</small>}
                      </td>
                      <td data-label="Qty" className="num">{number(item.quantity)}</td>
                      <td data-label="Price" className="num">{money(item.unit_price)}</td>
                      <td data-label="Amount" className="num">{money(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {returns.length > 0 && (
              <div>
                <h3 className="section-title">Returns</h3>
                {returns.map((entry) => (
                  <div className="list-row" key={entry.id}>
                    <div><strong>{entry.return_reference}</strong><small>{dateTime(entry.return_date)} · {entry.processed_by_name} · {entry.reason}</small></div>
                    <strong>-{money(entry.refund_amount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={showReceipt && Boolean(sale)} onClose={() => setShowReceipt(false)} size="sm" title="Receipt" className="receipt-modal"
        footer={<><button type="button" className="btn btn-ghost" onClick={() => setShowReceipt(false)}>Close</button><button type="button" className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> Print</button></>}>
        {sale && <Receipt sale={sale} items={items} payments={payments} />}
      </Modal>

      <ConfirmDialog open={confirmCancel} title={`Cancel ${sale?.invoice_number || 'sale'}?`} message="All items go back to stock and the payment is voided. This cannot be undone." confirmLabel="Cancel sale"
        requireReason reasonLabel="Cancellation reason" busy={busy} onConfirm={cancelSale} onClose={() => setConfirmCancel(false)} />
    </>
  )
}
