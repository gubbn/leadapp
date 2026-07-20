'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'

type ConfigStatus = {
  ready: boolean
  missing: string[]
  senderUser: string
}

const defaultSubject = 'Can we help make your IT simpler this month?'

const defaultBody = `<p>Hi {{first_name}},</p>
<p>We help small businesses make IT feel calmer, safer and easier to manage.</p>
<p>If anything in your setup has started to feel slow, unclear or fragile, we can take a quick look and point you towards the most useful next step.</p>
<p>Would a free 30-minute review be useful?</p>
<p>Thanks,<br>Fixing IT</p>`

export default function AutomationPage() {
  const [status, setStatus] = useState<ConfigStatus | null>(null)
  const [testTo, setTestTo] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultBody)
  const [ctaUrl, setCtaUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    loadStatus()
  }, [])

  const trackingId = useMemo(() => {
    return `test-${Date.now()}`
  }, [])

  const htmlPreview = useMemo(() => {
    return buildEmailHtml({
      body,
      ctaUrl,
      trackingId,
      baseUrl:
        typeof window === 'undefined'
          ? ''
          : `${window.location.protocol}//${window.location.host}`,
    })
  }, [body, ctaUrl, trackingId])

  async function loadStatus() {
    setErrorMessage('')

    const response = await fetch('/api/m365/status')
    const data = (await response.json()) as ConfigStatus
    setStatus(data)
  }

  async function sendTestEmail() {
    setSending(true)
    setMessage('')
    setErrorMessage('')

    const response = await fetch('/api/m365/send-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: testTo,
        subject,
        html: htmlPreview,
        trackingId,
      }),
    })

    const data = (await response.json()) as {
      ok?: boolean
      error?: string
      missing?: string[]
    }

    if (!response.ok) {
      setErrorMessage(
        data.error ||
          `Could not send test email${
            data.missing?.length ? `: ${data.missing.join(', ')}` : ''
          }.`,
      )
      setSending(false)
      return
    }

    setMessage('Test email accepted by Microsoft 365.')
    setSending(false)
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Link href="/" className="text-sm font-bold text-red-600">
            Back to dashboard
          </Link>

          <div className="mt-6 max-w-4xl">
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              Automation
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Send, track and follow up from Microsoft 365.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Build towards automatic campaign sending, reply tracking and
              follow-up queues while keeping control over what gets sent.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-stone-950">
              Microsoft 365 setup
            </h2>

            <div className="mt-5">
              {!status ? (
                <p className="text-sm font-semibold text-stone-500">
                  Checking setup...
                </p>
              ) : status.ready ? (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                  <p className="font-black text-green-800">
                    Microsoft 365 sending is configured.
                  </p>
                  <p className="mt-1 text-sm text-green-700">
                    Sender: {status.senderUser}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-black text-amber-900">
                    Microsoft 365 sending is not ready yet.
                  </p>

                  <p className="mt-2 text-sm text-amber-800">
                    Add these values to `.env.local`, then restart the dev
                    server:
                  </p>

                  <ul className="mt-3 list-inside list-disc text-sm font-semibold text-amber-900">
                    {status.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-stone-500">
                Azure app permissions
              </p>

              <div className="mt-3 space-y-2 text-sm text-stone-700">
                <ChecklistItem text="Create an app registration in Microsoft Entra ID." />
                <ChecklistItem text="Add Microsoft Graph application permission: Mail.Send." />
                <ChecklistItem text="Grant admin consent for the permission." />
                <ChecklistItem text="Create a client secret and save it in .env.local." />
                <ChecklistItem text="Use a licensed mailbox as M365_SENDER_USER." />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-stone-950">
              Test campaign email
            </h2>

            <p className="mt-1 text-sm text-stone-500">
              Send a single test first. Bulk sending should stay locked until
              tracking and DNC handling are confirmed.
            </p>

            <div className="mt-5 grid gap-4">
              <Input
                label="Test recipient"
                value={testTo}
                onChange={setTestTo}
                placeholder="you@example.com"
              />

              <Input
                label="Subject"
                value={subject}
                onChange={setSubject}
              />

              <RichTextEditor
                label="Message"
                value={body}
                onChange={setBody}
              />

              <Input
                label="Optional CTA URL"
                value={ctaUrl}
                onChange={setCtaUrl}
                placeholder="https://example.com/book"
              />
            </div>

            <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-stone-500">
                Preview
              </p>

              <div
                className="mt-3 rounded-xl border border-stone-200 bg-white p-4 text-sm leading-6"
                dangerouslySetInnerHTML={{ __html: htmlPreview }}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={sendTestEmail}
                disabled={sending || !testTo.trim()}
                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send test email'}
              </button>

              <button
                type="button"
                onClick={loadStatus}
                className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
              >
                Recheck setup
              </button>
            </div>

            {message ? (
              <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">
                {message}
              </p>
            ) : null}

            {errorMessage ? (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
                {errorMessage}
              </p>
            ) : null}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-stone-950">
            Automation roadmap
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <RoadmapCard
              title="1. Send"
              text="Use Microsoft Graph sendMail to send approved campaign emails from your M365 mailbox."
            />
            <RoadmapCard
              title="2. Track"
              text="Use a tracking pixel and tracked CTA links to record approximate opens and clicks."
            />
            <RoadmapCard
              title="3. Replies"
              text="Use Graph mail subscriptions or scheduled inbox polling to pull replies back into the dashboard."
            />
            <RoadmapCard
              title="4. Follow up"
              text="Categorise replies, mark DNC automatically and create a follow-up queue for human approval."
            />
          </div>
        </section>
      </section>
    </main>
  )
}

function buildEmailHtml({
  body,
  ctaUrl,
  trackingId,
  baseUrl,
}: {
  body: string
  ctaUrl: string
  trackingId: string
  baseUrl: string
}) {
  const formattedBody = body.replaceAll('{{first_name}}', 'Nikki')

  const safeCtaUrl = ctaUrl.trim()
  const trackedUrl = safeCtaUrl
    ? `${baseUrl}/api/track/click?id=${encodeURIComponent(
        trackingId,
      )}&url=${encodeURIComponent(safeCtaUrl)}`
    : ''

  return `
    <div style="font-family: Arial, sans-serif; color: #1c1917;">
      ${formattedBody}
      ${
        trackedUrl
          ? `<p><a href="${trackedUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:bold;">Book a review</a></p>`
          : ''
      }
    </div>
  `
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
      />
    </label>
  )
}

function RichTextEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [editorError, setEditorError] = useState('')

  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.innerHTML !== value) editor.innerHTML = value
  }, [value])

  function runCommand(command: 'bold' | 'italic' | 'underline' | 'insertOrderedList' | 'insertUnorderedList') {
    editorRef.current?.focus()
    document.execCommand(command)
    onChange(editorRef.current?.innerHTML || '')
  }

  function addImage(file: File) {
    setEditorError('')

    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      setEditorError('Use a PNG, JPG, GIF or WebP image.')
      return
    }

    if (file.size > 1_500_000) {
      setEditorError('Images must be smaller than 1.5 MB.')
      return
    }

    const imageCount = editorRef.current?.querySelectorAll('img').length || 0
    if (imageCount >= 3) {
      setEditorError('You can add up to three images to one email.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      editorRef.current?.focus()
      document.execCommand('insertImage', false, reader.result)
      const images = editorRef.current?.querySelectorAll('img')
      const insertedImage = images?.item((images?.length || 1) - 1)
      insertedImage?.setAttribute('style', 'display:block;max-width:100%;height:auto;margin:16px 0;')
      insertedImage?.setAttribute('alt', file.name.replace(/\.[^.]+$/, ''))
      onChange(editorRef.current?.innerHTML || '')
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>

      <div className="mt-1 overflow-hidden rounded-xl border border-stone-300 bg-white focus-within:border-red-500 focus-within:ring-4 focus-within:ring-red-50">
        <div className="flex flex-wrap items-center gap-1 border-b border-stone-200 bg-stone-50 px-2 py-2">
          <EditorButton label="Bold" onClick={() => runCommand('bold')}><strong>B</strong></EditorButton>
          <EditorButton label="Italic" onClick={() => runCommand('italic')}><em>I</em></EditorButton>
          <EditorButton label="Underline" onClick={() => runCommand('underline')}><span className="underline">U</span></EditorButton>
          <EditorButton label="Numbered list" onClick={() => runCommand('insertOrderedList')}><span>1.</span></EditorButton>
          <EditorButton label="Bulleted list" onClick={() => runCommand('insertUnorderedList')}><span>•</span></EditorButton>
          <EditorButton label="Add image" onClick={() => imageInputRef.current?.click()}>
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
              <rect x="2.5" y="3" width="15" height="14" rx="2" />
              <circle cx="7" cy="7.5" r="1.5" />
              <path d="m4.5 14 3.5-3.5 2.5 2.5 2-2 3 3" />
            </svg>
          </EditorButton>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) addImage(file)
              event.target.value = ''
            }}
          />
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={label}
          aria-multiline="true"
          onInput={(event) => onChange(event.currentTarget.innerHTML)}
          onPaste={(event) => {
            event.preventDefault()
            document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
          }}
          className="min-h-64 px-4 py-3 text-sm leading-6 outline-none [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-3 [&_ul]:list-disc"
        />
      </div>

      <div className="mt-1 flex items-start justify-between gap-3 text-xs text-stone-500">
        <span>Formatting and up to three inline images are included in the email.</span>
        <span>{stripHtml(value).length.toLocaleString('en-GB')} characters</span>
      </div>

      {editorError ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{editorError}</p>
      ) : null}
    </div>
  )
}

function EditorButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-base text-stone-600 transition hover:bg-white hover:text-red-600"
    >
      {children}
    </button>
  )
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function ChecklistItem({ text }: { text: string }) {
  return (
    <div className="flex gap-2">
      <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
      <span>{text}</span>
    </div>
  )
}

function RoadmapCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <h3 className="font-black text-stone-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-stone-600">{text}</p>
    </div>
  )
}
