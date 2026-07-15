'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
      else setError('This link has expired. Please request a new one.')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    await fetch('/api/beta-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'password_set', source: 'web_app' }),
    }).catch(() => null)
    router.push('/auth/profile-setup')
  }

  if (!ready) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF8F3', fontFamily: 'DM Sans, sans-serif', color: error ? '#c0392b' : '#8A8784' }}>
      {error || 'Setting up your account…'}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#FBF8F3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '2.5rem', background: '#fff', borderRadius: 16, border: '0.5px solid rgba(26,25,23,0.1)', boxShadow: '0 4px 24px rgba(26,25,23,0.06)' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 28, color: '#1A1917', marginBottom: 8 }}>Set your password</div>
        <p style={{ color: '#8A8784', fontSize: 14, marginBottom: 24 }}>Choose a password to access your Beckett account.</p>
        {error && <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 16 }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <input type="password" placeholder="Password (min 8 characters)" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 12, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          <input type="password" placeholder="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 20, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          <button type="submit" disabled={loading} style={{ width: '100%', background: '#BA7517', color: '#fff', border: 'none', borderRadius: 100, padding: '11px', fontSize: 15, fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Setting password…' : 'Set password and sign in'}
          </button>
          <p style={{ color: '#8A8784', fontSize: 12, lineHeight: 1.5, marginTop: 16, textAlign: 'center' }}>
            By continuing, you confirm that you are at least 18, are located in the United States,
            and agree to Beckett&apos;s <Link href="/terms" style={{ color: '#BA7517' }}>Terms</Link> and{' '}
            <Link href="/privacy" style={{ color: '#BA7517' }}>Privacy Policy</Link>.
          </p>
        </form>
      </div>
    </div>
  )
}
