import { useState } from 'react'
import { KeyRound, LogOut, Save, ShieldCheck } from 'lucide-react'
import { DetailList, Field, PageHeader, Panel, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import api, { errorMessage } from '../services/api'
import { ROLE_LABELS } from '../utils/format'

const PERMISSIONS = {
  OWNER: ['Full access to sales, stock, purchasing and reports', 'Cancel sales and give unlimited discounts', 'Manage products, categories, suppliers and prices', 'Create and deactivate cashier accounts', 'View audit logs and edit business settings'],
  CASHIER: ['Ring up sales on the Point of Sale', 'Give discounts up to 10% of the sale', 'Process returns and refunds', 'Add and update customers', 'View products, prices and stock levels']
}

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth()
  const notify = useToast()
  const [name, setName] = useState(user.name)
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function saveName(event) {
    event.preventDefault()
    setBusy('profile')
    try {
      const { data } = await api.put('/auth/profile', { name })
      setUser(data.user)
      notify('Profile updated.')
    } catch (err) {
      notify(errorMessage(err), 'error')
    } finally {
      setBusy('')
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    setError('')
    if (passwords.new_password !== passwords.confirm) { setError('New passwords do not match.'); return }
    setBusy('password')
    try {
      await api.put('/auth/password', passwords)
      setPasswords({ current_password: '', new_password: '', confirm: '' })
      notify('Password updated.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <PageHeader eyebrow="MY ACCOUNT" title={user.name} description={user.email}
        actions={<button type="button" className="btn btn-ghost" onClick={logout}><LogOut size={16} /> Log out</button>} />
      <div className="settings-layout">
        <div className="stack">
          <Panel title="Profile">
            <form className="form-grid" onSubmit={saveName}>
              <Field label="Display name" required full><input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
              <div className="field-full form-actions"><button type="submit" className="btn btn-primary" disabled={busy === 'profile' || !name.trim() || name === user.name}><Save size={16} /> Save name</button></div>
            </form>
          </Panel>
          <Panel title="Change password">
            <form className="form-grid" onSubmit={savePassword}>
              <Field label="Current password" required full><input type="password" autoComplete="current-password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} required /></Field>
              <Field label="New password" required hint="At least 8 characters."><input type="password" autoComplete="new-password" minLength={8} value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} required /></Field>
              <Field label="Confirm new password" required><input type="password" autoComplete="new-password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} required /></Field>
              {error && <div className="alert alert-error field-full">{error}</div>}
              <div className="field-full form-actions"><button type="submit" className="btn btn-primary" disabled={busy === 'password'}><KeyRound size={16} /> Update password</button></div>
            </form>
          </Panel>
        </div>
        <Panel title="Access level">
          <DetailList items={[['Role', <StatusBadge key="r" value={user.role} label={ROLE_LABELS[user.role]} />], ['Email', user.email], ['Status', <StatusBadge key="s" value={user.status} />]]} />
          <ul className="permission-list">
            {PERMISSIONS[user.role].map((permission) => <li key={permission}><ShieldCheck size={15} /> {permission}</li>)}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
