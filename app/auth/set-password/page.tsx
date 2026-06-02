'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    // Poll for session — the server callback sets it in a cookie
    // but the client may need a moment to pick it up
    let attempts = 0
    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setSessionReady(true)
        clearInterval(interval)
      } else if (++attempts > 10) {
        setError('Session expired. Please click the link in your email again.')
        clearInterval(interval)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
  }

  if (!sessionReady && !error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF8F3', fontFamily: 'DM Sans, sans-serif', color: '#8A8784' }}>
      Setting up your account…
    </div>
  )

  if (error && !sessionReady) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF8F3', fontFamily: 'DM Sans, sans-serif', color: '#c0392b' }}>
      {error}
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
          <button type="submit" disabled={loading || !sessionReady} style={{ width: '100%', background: '#BA7517', color: '#fff', border: 'none', borderRadius: 100, padding: '11px', fontSize: 15, fontWeight: 500, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Setting password…' : 'Set password and sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
