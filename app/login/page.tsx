'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setIsSigningIn(true)
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMessage(error.message)
      setIsSigningIn(false)
      return
    }

    const nextPath = searchParams.get('next') || '/'

    router.push(nextPath)
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10 text-stone-900">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <div>
          <p className="text-xl font-black tracking-tight text-red-600">
            Fixing IT
          </p>

          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
            Marketing Dashboard
          </p>
        </div>

        <div className="mt-8">
          <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
            Restricted access
          </p>

          <h1 className="mt-4 text-3xl font-black tracking-tight text-stone-950">
            Sign in to your dashboard.
          </h1>

          <p className="mt-3 text-sm leading-6 text-stone-600">
            Use the email address and password provided by Fixing IT.
            Public sign-up is not available. All rights reserved to Fixing IT Limited.
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-stone-500">
              Email address
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
            />
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-stone-500">
              Password
            </span>

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
            />
          </label>

          {errorMessage && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSigningIn ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

function LoginLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-10 text-stone-900">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-stone-500">
          Loading login...
        </p>
      </section>
    </main>
  )
}