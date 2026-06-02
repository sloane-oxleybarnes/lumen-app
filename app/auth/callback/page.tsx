'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthCallbackPage() {
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session) {
          const hash = window.location.hash
          const type = new URLSearchParams(hash.substring(1)).get('type')
          if (type === 'invite' || type === 'recovery') {
            router.push('/auth/set-password')
          } else {
            router.push('/dashboard')
          }
        }
      }
      if (event === 'PASSWORD_RECOVERY') {
        router.push('/auth/set-password')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF8F3', fontFamily: 'DM Sans, sans-serif', color: '#8A8784' }}>
      Setting up your account…
    </div>
  )
}
