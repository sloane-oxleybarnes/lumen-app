'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent'>('idle')
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setError('')

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://meetbeckett.co'
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`,
    })

    if (error) {
      setError(error.message)
      setStatus('idle')
    } else {
      setStatus('sent')
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span
              className="text-2xl text-ink"
              style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}
            >
              Beckett
            </span>
          </Link>
        </div>

        <div className="bg-white rounded-card border border-border p-8 shadow-sm">
          {status === 'sent' ? (
            <div className="text-center">
              <h1
                className="text-2xl text-ink mb-3"
                style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}
              >
                Check your email
              </h1>
              <p className="text-ink-light text-sm mb-6">
                If an account exists for <strong>{email}</strong>, you will receive a password reset link shortly.
              </p>
              <Link href="/auth/login" className="text-primary text-sm hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1
                className="text-2xl text-ink mb-2"
                style={{ fontFamily: 'var(--font-dm-serif), Georgia, serif' }}
              >
                Reset your password
              </h1>
              <p className="text-ink-light text-sm mb-6">
                Enter your email and we will send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-sm px-3 py-2">
                    {error}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full border border-border rounded-sm px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full bg-primary text-white rounded-pill py-3 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {status === 'loading' ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="text-center text-sm text-ink-light mt-6">
                <Link href="/auth/login" className="text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
