'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Setting up your account…')

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      setStatus('Configuration error: Supabase environment variables are not set. Contact support.')
      return
    }

    const supabase = createClient()

    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const searchParams = new URLSearchParams(window.location.search)

    const access_token = hashParams.get('access_token')
    const refresh_token = hashParams.get('refresh_token')
    const type = hashParams.get('type') || searchParams.get('type')
    const error = hashParams.get('error') || searchParams.get('error')
    const error_description = hashParams.get('error_description') || searchParams.get('error_description')
    const token_hash = searchParams.get('token_hash')
    const code = searchParams.get('code')

    if (error) {
      router.push(`/auth/login?error=${encodeURIComponent(error_description || error)}`)
      return
    }

    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) {
          setStatus(`Auth error: ${error.message}`)
          return
        }
        if (type === 'invite' || type === 'recovery') {
          router.push('/auth/set-password')
        } else {
          router.push('/dashboard')
        }
      })
      return
    }

    if (token_hash && type) {
      supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType }).then(({ error }) => {
        if (error) {
          setStatus(`Auth error: ${error.message}`)
          return
        }
        if (type === 'invite' || type === 'recovery') {
          router.push('/auth/set-password')
        } else {
          router.push('/dashboard')
        }
      })
      return
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setStatus(`Auth error: ${error.message}`)
        else router.push('/dashboard')
      })
      return
    }

    router.push('/auth/signin')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF8F3', fontFamily: 'DM Sans, sans-serif', color: '#8A8784', fontSize: 15, padding: '2rem', textAlign: 'center' }}>
      {status}
    </div>
  )
}
