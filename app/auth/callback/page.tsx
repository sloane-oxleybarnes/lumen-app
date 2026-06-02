'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)

    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    const type = params.get('type')
    const error = params.get('error')
    const error_description = params.get('error_description')

    // Handle errors from Supabase
    if (error) {
      router.push(`/auth/signin?error=${encodeURIComponent(error_description || error)}`)
      return
    }

    // Handle token-based flow (invite, recovery, magic link)
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token })
        .then(({ error }) => {
          if (error) {
            router.push(`/auth/signin?error=${encodeURIComponent(error.message)}`)
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

    // Handle code-based flow (OAuth, PKCE)
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => {
          if (error) router.push('/auth/signin?error=invalid_token')
          else router.push('/dashboard')
        })
      return
    }

    // Nothing to work with
    router.push('/auth/signin')
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF8F3', fontFamily: 'DM Sans, sans-serif', color: '#8A8784', fontSize: 15 }}>
      Setting up your account…
    </div>
  )
}
