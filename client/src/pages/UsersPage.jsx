import { useEffect, useState } from 'react'
import { Edit3, KeyRound, UserCog, UserPlus } from 'lucide-react'
import { DataTable, Field, Modal, PageHeader, Panel, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useApi } from '../hooks/useApi'
import api, { errorMessage } from '../services/api'
import { ROLE_LABELS, date, money, moneyShort, number, relativeTime } from '../utils/format'

export default function UsersPage() {
  const { user: me } = useAuth()
  const { data, loading, error, reload } = useApi('/users')
  const [editing, setEditing] = useState(null)
  const [resetting, setResetting] = useState(null)
  const rows = data?.users || []

  const columns = [
    { key: 'name', label: 'User', primary: true, render: (row) => <><span className="cell-title">{row.name}{row.id === me.id ? ' (you)' : ''}</span><small className="cell-sub">{row.email}</small></> },
    { key: 'role', label: 'Role', render: (row) => <StatusBadge value={row.role} label={ROLE_LABELS[row.role]} /> },
    { key: 'month_sales', label: 'Sales this month', align: 'right', render: (row) => <>{money(row.month_sales)}<small className="cell-sub">{number(row.month_transactions)} transactions</small></> },
    { key: 'lifetime_sales', label: 'Lifetime sales', align: 'right', hideMobile: true, render: (row) => moneyShort(row.lifetime_sales) },
    { key: 'last_login_at', label: 'Last sign-in', render: (row) => relativeTime(row.last_login_at) },
    { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', label: '', actions: true, render: (row) => (
      <div className="row-actions">
        <button type="button" className="icon-button bordered" onClick={(event) => { event.stopPropagation(); setEditing(row) }} aria-label={`Edit ${row.name}`}><Edit3 size={15} /></button>
        {row.id !== me.id && <button type="button" className="icon-button bordered" onClick={(event) => { event.stopPropagation(); setResetting(row) }} aria-label={`Reset password for ${row.name}`} title="Reset password"><KeyRound size={15} /></button>}
      </div>
    ) }
  ]

  return (
    <div>
      <PageHeader eyebrow="PEOPLE" title="Users" description="Owner and cashier accounts. Deactivated users can no longer sign in, but their sales history stays."
        actions={<button type="button" className="btn btn-primary" onClick={() => setEditing({ name: '', email: '', password: '', status: 'ACTIVE' })}><UserPlus size={16} /> Add cashier</button>} />
      <Panel flush>
        <DataTable columns={columns} rows={rows} loading={loading} error={error} onRetry={reload} onRowClick={setEditing} empty={{ icon: UserCog, title: 'No users' }} />
      </Panel>
      <UserForm user={editing} me={me} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />
      <ResetPassword user={resetting} onClose={() => setResetting(null)} />
    </div>
  )
}

function UserForm({ user, me, onClose, onSaved }) {
  const notify = useToast()
  const [form, setForm] = useState({ name: '', email: '', password: '', status: 'ACTIVE' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (user) { setForm({ name: user.name || '', email: user.email || '', password: '', status: user.status || 'ACTIVE' }); setError('') } }, [user])
  const isNew = !user?.id
  const canChangeStatus = !isNew && user.role !== 'OWNER' && user.id !== me.id

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (isNew) await api.post('/users', form)
      else await api.put(`/users/${user.id}`, { name: form.name, email: form.email, status: form.status })
      notify(isNew ? 'Cashier account created.' : 'User updated.')
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(user)} onClose={onClose} size="sm" title={isNew ? 'Add cashier' : `Edit ${user?.name}`} subtitle={isNew ? 'The cashier signs in with this email and password.' : `${ROLE_LABELS[user?.role]} · since ${date(user?.created_at)}`}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button></>}>
      <form id="user-form" className="form-grid" onSubmit={save}>
        <Field label="Full name" required full><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus /></Field>
        <Field label="Email" required full><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
        {isNew && <Field label="Temporary password" required full hint="At least 8 characters. Ask the cashier to change it under My Account."><input type="text" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={8} /></Field>}
        {canChangeStatus && <Field label="Status" full><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="ACTIVE">Active: can sign in</option><option value="INACTIVE">Inactive: access revoked</option></select></Field>}
        {error && <div className="alert alert-error field-full">{error}</div>}
      </form>
    </Modal>
  )
}

function ResetPassword({ user, onClose }) {
  const notify = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { setPassword(''); setError('') }, [user])

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      const { data } = await api.put(`/users/${user.id}/password`, { password })
      notify(data.message)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(user)} onClose={onClose} size="sm" title="Reset password" subtitle={user ? `${user.name} · ${user.email}` : ''}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button type="submit" form="reset-form" className="btn btn-primary" disabled={busy || password.length < 8}>{busy ? 'Saving...' : 'Reset password'}</button></>}>
      <form id="reset-form" className="form-grid" onSubmit={save}>
        <Field label="New password" required full hint="At least 8 characters."><input type="text" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus minLength={8} /></Field>
        {error && <div className="alert alert-error field-full">{error}</div>}
      </form>
    </Modal>
  )
}
