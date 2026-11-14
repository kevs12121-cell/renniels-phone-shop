import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, Mail, Smartphone } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../services/api'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(params.get('expired') ? 'Your session expired. Please sign in again.' : '')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={location.state?.from || '/dashboard'} replace />

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const signedIn = await login(form.email.trim(), form.password)
      navigate(location.state?.from || (signedIn.role === 'CASHIER' ? '/pos' : '/dashboard'), { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Unable to sign in right now.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-visual">
        <div className="visual-grid" />
        <div className="visual-content">
          <div className="brand-mark large"><Smartphone size={29} /></div>
          <p className="eyebrow">RETAIL OPERATIONS</p>
          <h1>Every device.<br /><em>Accounted for.</em></h1>
          <p className="visual-copy">Point of sale, IMEI-tracked inventory, purchasing and reports for your phone shop team.</p>
          <div className="visual-line" />
        </div>
        <div className="visual-footer">RENNIELS PHONE SHOP <span>•</span> INTERNAL SYSTEM</div>
      </div>
      <main className="login-panel">
        <div className="login-form-wrap">
          <div className="mobile-brand"><div className="brand-mark"><Smartphone size={20} /></div><strong>Renniels Phone Shop</strong></div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to your workspace</h2>
          <p className="login-subtitle">Use your owner or cashier account to continue.</p>
          <form onSubmit={submit} noValidate>
            {error && <div className="alert alert-error">{error}</div>}
            <label className="login-label">Email address
              <div className="input-wrap"><Mail size={17} /><input type="email" required autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@renniels.local" /></div>
            </label>
            <label className="login-label">Password
              <div className="input-wrap">
                <LockKeyhole size={17} />
                <input type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Enter your password" />
                <button type="button" className="icon-button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy || !form.email || !form.password}>{busy ? 'Signing in...' : 'Sign in'} <span aria-hidden="true">→</span></button>
          </form>
          <p className="login-note">Authorized shop personnel only.</p>
        </div>
        <div className="login-bottom">Renniels Phone Shop <span>v2.0</span></div>
      </main>
    </div>
  )
}
