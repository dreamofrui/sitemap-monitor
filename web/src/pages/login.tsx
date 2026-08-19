import { FormEvent, useState } from 'react'
import { useRouter } from 'next/router'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    if (!response.ok) {
      setError((await response.json()).error || 'Unable to sign in')
      return
    }
    await router.push(typeof router.query.next === 'string' ? router.query.next : '/')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white">
      <form onSubmit={submit} className="card-cyber p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-neon-cyan mb-6">MONITOR LOGIN</h1>
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Deployment password"
          className="input-cyber w-full mb-4"
        />
        <button type="submit" className="btn-cyber w-full">SIGN IN</button>
        {error && <p className="mt-4 text-neon-magenta font-mono">{error}</p>}
      </form>
    </main>
  )
}

