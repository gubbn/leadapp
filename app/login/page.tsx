'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, CheckCircle2, LockKeyhole, Radar, ShieldCheck } from 'lucide-react'
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

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setErrorMessage(error.message)
      setIsSigningIn(false)
      return
    }

    router.push(searchParams.get('next') || '/')
    router.refresh()
  }

  return (
    <main className="grid min-h-screen bg-stone-950 text-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden min-h-screen overflow-hidden border-r border-white/10 p-10 lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-48 -top-48 h-[36rem] w-[36rem] rounded-full bg-red-600/20 blur-3xl" />
          <Radar className="absolute -bottom-24 -right-24 h-[34rem] w-[34rem] rotate-12 text-white/[0.035]" strokeWidth={0.45} />
          <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-600 text-sm font-black tracking-[-0.08em] shadow-[0_12px_35px_rgba(221,63,39,0.28)]">FI</span>
          <div>
            <p className="text-base font-black">Fixing IT</p>
            <p className="mt-0.5 text-[0.62rem] font-bold uppercase tracking-[0.22em] text-stone-400">Growth desk</p>
          </div>
        </div>

        <div className="relative max-w-2xl">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-red-400">One focused workspace</p>
          <h1 className="mt-5 text-5xl font-black leading-[1.02] tracking-[-0.05em] xl:text-7xl">
            Relationships.<br />
            Revenue.<br />
            <span className="text-red-500">Momentum.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-stone-400">
            The daily operating system for turning conversations into lasting customer relationships.
          </p>
        </div>

        <div className="relative flex flex-wrap gap-x-7 gap-y-3 text-xs font-bold text-stone-400">
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400" />Relationship context</span>
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400" />Pipeline clarity</span>
          <span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400" />Campaign rhythm</span>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center bg-stone-50 px-5 py-10 text-stone-950 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-600 text-sm font-black tracking-[-0.08em] text-white">FI</span>
            <div>
              <p className="font-black">Fixing IT</p>
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-stone-500">Growth desk</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-stone-600 shadow-sm">
            <ShieldCheck size={14} className="text-red-600" />
            Private workspace
          </div>
          <h2 className="mt-5 text-4xl font-black tracking-[-0.04em] text-stone-950">Welcome back.</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">Sign in to pick up where you left off.</p>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-xs font-black text-stone-700">Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                placeholder="you@fixingit.co.uk"
                className="form-input mt-2 py-3"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black text-stone-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="form-input mt-2 py-3"
              />
            </label>

            {errorMessage ? (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                <LockKeyhole size={17} className="mt-0.5 shrink-0" />
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSigningIn}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_30px_rgba(16,19,18,0.15)] transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSigningIn ? 'Signing in…' : 'Enter Growth Desk'}
              {!isSigningIn ? <ArrowRight size={17} className="transition group-hover:translate-x-0.5" /> : null}
            </button>
          </form>

          <p className="mt-7 text-center text-xs leading-5 text-stone-400">
            Authorised Fixing IT team members only.
          </p>
        </div>
      </section>
    </main>
  )
}

function LoginLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-950 text-white">
      <div className="flex items-center gap-3 text-sm font-bold text-stone-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        Preparing your workspace…
      </div>
    </main>
  )
}
