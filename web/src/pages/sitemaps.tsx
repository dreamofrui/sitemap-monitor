import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { Feed } from '@/lib/supabase'
import { motion } from 'framer-motion'

export default function SitemapsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [loading, setLoading] = useState(true)
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [scanningId, setScanningId] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function loadFeeds() {
    try {
      const response = await fetch('/api/sources')
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to load sources')
      const data = await response.json()
      setFeeds(data)
    } catch (error) {
      console.error('Error loading feeds:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFeeds()
  }, [])

  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!newUrl.trim()) {
      setError('Please enter a URL')
      return
    }

    try {
      new URL(newUrl) // Validate URL
    } catch {
      setError('Invalid URL format')
      return
    }

    setAdding(true)
    try {
      const response = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl })
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to add sitemap')
      setNewUrl('')
      await loadFeeds()
    } catch (error: any) {
      setError(error.message || 'Failed to add sitemap')
    } finally {
      setAdding(false)
    }
  }

  async function handleToggleFeed(id: number, active: boolean) {
    try {
      const response = await fetch('/api/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active: !active })
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to update sitemap')
      await loadFeeds()
    } catch (error) {
      console.error('Error deleting feed:', error)
      alert('Failed to delete sitemap')
    }
  }

  async function handleScan(id: number) {
    setScanningId(id)
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Scan failed')
      await loadFeeds()
    } catch (error: any) {
      setError(error.message || 'Scan failed')
      // Refresh source health after a failed scan so the persisted error is visible.
      await loadFeeds()
    } finally {
      setScanningId(null)
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-neon-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400 font-mono">LOADING SITEMAPS...</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <h1 className="text-5xl font-bold mb-4">
          <span className="text-neon-magenta text-glow">SITEMAP</span>{' '}
          <span className="text-white">MANAGEMENT</span>
        </h1>
        <p className="text-gray-400 font-mono text-lg">
          {feeds.length} SITEMAPS CONFIGURED // MANAGE YOUR DATA SOURCES
        </p>
      </motion.div>

      {/* Add New Sitemap */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="card-cyber p-6 mb-8"
      >
        <h2 className="text-xl font-bold text-neon-cyan mb-4 uppercase tracking-wider">
          Add New Sitemap
        </h2>
        <form onSubmit={handleAddFeed} className="flex gap-4">
          <input
            type="text"
            placeholder="https://example.com/sitemap.xml"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="input-cyber flex-1"
            disabled={adding}
          />
          <button
            type="submit"
            disabled={adding}
            className="btn-cyber disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? 'ADDING...' : 'ADD SITEMAP'}
          </button>
        </form>
        {error && (
          <p className="mt-3 text-neon-magenta text-sm font-mono">
            ⚠️ {error}
          </p>
        )}
      </motion.div>

      {/* Sitemap List */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h2 className="text-2xl font-bold mb-6 uppercase tracking-wider">
          <span className="text-neon-cyan">CONFIGURED</span> SITEMAPS
        </h2>

        {feeds.length === 0 ? (
          <div className="card-cyber p-12 text-center">
            <p className="text-gray-500 text-lg font-mono">
              NO SITEMAPS CONFIGURED
            </p>
            <p className="text-gray-600 text-sm mt-2">
              Add your first sitemap above to start tracking games
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {feeds.map((feed, index) => (
              <motion.div
                key={feed.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="card-cyber p-6 hover:border-neon-cyan/40 transition-all duration-300 group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Domain badge */}
                    <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-neon-cyan/20 to-neon-magenta/20 border border-neon-cyan/30 text-neon-cyan mb-3">
                      🌐 {feed.site || feed.domain}
                    </div>

                    {/* URL */}
                    <p className="text-sm text-gray-300 font-mono break-all mb-3 group-hover:text-neon-cyan transition-colors">
                      {feed.url}
                    </p>

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-500 font-mono">
                      <span>
                        ADDED: {new Date(feed.createdAt || feed.created_at).toLocaleDateString()}
                      </span>
                      <span>
                        LAST SCAN: {feed.lastSuccessfulScanAt ? new Date(feed.lastSuccessfulScanAt).toLocaleString() : 'NEVER'}
                      </span>
                      <span className={feed.lastScanStatus === 'failed' ? 'text-neon-magenta' : feed.lastScanStatus === 'succeeded' ? 'text-green-400' : 'text-gray-500'}>
                        HEALTH: {(feed.lastScanStatus || 'never').toUpperCase()}
                      </span>
                      <span className={feed.active ? 'text-green-400' : 'text-gray-600'}>
                        {feed.active !== false ? 'ACTIVE' : 'PAUSED'}
                      </span>
                      <span>
                        BASELINE: {feed.baselineEstablished ? 'READY' : 'PENDING'}
                      </span>
                    </div>
                    {feed.lastError && (
                      <p className="mt-2 text-xs text-neon-magenta font-mono break-words">
                        LAST ERROR: {feed.lastError}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="ml-6 flex items-center space-x-3">
                    <a
                      href={feed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-md text-sm font-semibold border border-gray-700 text-gray-400 hover:border-neon-cyan hover:text-neon-cyan transition-all duration-300"
                    >
                      VIEW
                    </a>
                    <button
                      onClick={() => handleScan(feed.id)}
                      disabled={feed.active === false || scanningId === feed.id}
                      className="px-4 py-2 rounded-md text-sm font-semibold border border-gray-700 text-gray-400 hover:border-neon-cyan hover:text-neon-cyan transition-all duration-300 disabled:opacity-50"
                    >
                      {scanningId === feed.id ? 'SCANNING...' : 'SCAN'}
                    </button>
                    <button
                      onClick={() => handleToggleFeed(feed.id, feed.active !== false)}
                      className="px-4 py-2 rounded-md text-sm font-semibold border border-gray-700 text-gray-400 hover:border-neon-magenta hover:text-neon-magenta hover:bg-neon-magenta/10 transition-all duration-300"
                    >
                      {feed.active ? 'PAUSE' : 'REACTIVATE'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </Layout>
  )
}
