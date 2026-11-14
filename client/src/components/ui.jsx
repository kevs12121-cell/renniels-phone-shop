import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Clock3, Inbox, Loader2, MinusCircle, RefreshCw, Search, ShieldCheck, Undo2, X, XCircle } from 'lucide-react'
import { titleCase } from '../utils/format'

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Panel({ eyebrow, title, actions, children, className = '', flush = false }) {
  return (
    <section className={`panel ${flush ? 'panel-flush' : ''} ${className}`}>
      {(title || eyebrow || actions) && (
        <div className="panel-heading">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'blue', delta, loading }) {
  const deltaUp = delta && delta.value >= 0
  return (
    <div className="stat-card">
      {Icon && <div className={`stat-icon tone-${tone}`}><Icon size={18} /></div>}
      <div className="stat-body">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{loading ? <span className="skeleton" /> : value}</strong>
        {delta && Number.isFinite(delta.value) && !loading ? (
          <small className={`stat-delta ${deltaUp === (delta.goodWhenUp !== false) ? 'delta-good' : 'delta-bad'}`}>
            {deltaUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {deltaUp ? '+' : ''}{(delta.value * 100).toFixed(0)}% {delta.label}
          </small>
        ) : hint ? <small className="stat-hint">{hint}</small> : null}
      </div>
    </div>
  )
}

const STATUS = {
  COMPLETED: ['good', CheckCircle2], PAID: ['good', CheckCircle2], ACTIVE: ['good', CheckCircle2], IN_STOCK: ['good', CheckCircle2], 'IN STOCK': ['good', CheckCircle2], GOOD: ['good', CheckCircle2],
  CANCELLED: ['critical', XCircle], 'OUT OF STOCK': ['critical', XCircle], DAMAGED: ['critical', XCircle], UNPAID: ['critical', AlertCircle],
  RETURNED: ['warning', Undo2], PARTIAL: ['warning', Clock3], 'LOW STOCK': ['warning', AlertTriangle], PENDING: ['warning', Clock3],
  DEFECTIVE: ['serious', AlertTriangle], INACTIVE: ['neutral', MinusCircle], SOLD: ['info', CircleDot], RESERVED: ['info', Clock3],
  OWNER: ['info', ShieldCheck], CASHIER: ['neutral', CircleDot], VOIDED: ['critical', XCircle]
}

export function StatusBadge({ value, label }) {
  const [tone, Icon] = STATUS[value] || ['neutral', CircleDot]
  return <span className={`badge badge-${tone}`}><Icon size={12} aria-hidden="true" />{label || titleCase(value)}</span>
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Loader({ label = 'Loading...' }) {
  return <div className="loader"><Loader2 className="spin" size={20} /><span>{label}</span></div>
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="alert alert-error">
      <AlertCircle size={17} />
      <span>{error}</span>
      {onRetry && <button type="button" className="text-button" onClick={onRetry}><RefreshCw size={14} /> Retry</button>}
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title = 'Nothing here yet', text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={22} /></div>
      <strong>{title}</strong>
      {text && <span>{text}</span>}
      {action}
    </div>
  )
}

let openModals = 0

export function Modal({ open, title, subtitle, onClose, children, footer, size = 'md', className = '' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => { if (event.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    openModals += 1
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', onKey)
      openModals -= 1
      if (openModals <= 0) document.body.classList.remove('modal-open')
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={`modal-root ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="modal-backdrop" aria-label="Close dialog" onClick={onClose} />
      <div className={`modal modal-${size}`}>
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

export function Field({ label, hint, children, full = false, required = false }) {
  return (
    <label className={`field ${full ? 'field-full' : ''}`}>
      <span className="field-label">{label}{required && <em aria-hidden="true"> *</em>}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="search-box">
      <Search size={16} />
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search"><X size={14} /></button>}
    </div>
  )
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map(([optionValue, optionLabel]) => (
        <button key={optionValue || 'all'} type="button" role="tab" aria-selected={value === optionValue} className={value === optionValue ? 'active' : ''} onClick={() => onChange(optionValue)}>
          {optionLabel}
        </button>
      ))}
    </div>
  )
}

export function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>
}

export function DataTable({ columns, rows, loading, error, onRetry, empty = {}, onRowClick, pageSize = 15, rowKey = 'id', footer }) {
  const [page, setPage] = useState(1)
  const total = rows?.length || 0
  useEffect(() => { setPage(1) }, [total])

  if (error) return <div className="table-state"><ErrorBanner error={error} onRetry={onRetry} /></div>
  if (loading && !total) return <Loader label="Loading records..." />
  if (!total) return <EmptyState icon={empty.icon} title={empty.title || 'No records found'} text={empty.text || 'Try a different search or filter.'} action={empty.action} />

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * pageSize, current * pageSize)
  return (
    <div className={`table-container ${loading ? 'is-refreshing' : ''}`}>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>{columns.map((column) => <th key={column.key || column.label} className={column.align === 'right' ? 'num' : ''}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((row, index) => (
              <tr key={row[rowKey] ?? index} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((column) => (
                  <td key={column.key || column.label} data-label={column.label} className={[column.align === 'right' && 'num', column.primary && 'cell-primary', column.hideMobile && 'hide-mobile', column.actions && 'cell-actions'].filter(Boolean).join(' ')}>
                    <div className="cell">{column.render ? column.render(row) : row[column.key] ?? '—'}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer}
        </table>
      </div>
      {pages > 1 && (
        <div className="pagination">
          <span>Showing {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, total)} of {total}</span>
          <div>
            <button type="button" className="icon-button bordered" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <span className="page-indicator">{current} / {pages}</span>
            <button type="button" className="icon-button bordered" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', requireReason = false, reasonLabel = 'Reason', busy, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm" footer={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Back</button>
        <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} disabled={busy || (requireReason && !reason.trim())} onClick={() => onConfirm(reason.trim())}>{busy ? 'Working...' : confirmLabel}</button>
      </>
    }>
      <p className="dialog-text">{message}</p>
      {requireReason && <Field label={reasonLabel} required full><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus /></Field>}
    </Modal>
  )
}

export function DetailList({ items }) {
  return (
    <dl className="detail-list">
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>
      ))}
    </dl>
  )
}
