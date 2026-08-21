import type { SitemapSource } from '@/lib/supabase'

interface SourceStatusProps {
  sources: SitemapSource[]
  error?: string
}

function formatTimestamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'NEVER'
}

export default function SourceStatus({ sources, error }: SourceStatusProps) {
  return (
    <section className="mb-12" aria-labelledby="source-status-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h2 id="source-status-heading" className="text-3xl font-bold">
            <span className="text-neon-cyan">SOURCE</span>{' '}
            <span className="text-white">STATUS</span>
          </h2>
          <p className="text-sm text-gray-500 font-mono mt-2">
            {sources.length} SITEMAP SOURCES
          </p>
        </div>
        <a href="/sitemaps" className="text-sm text-neon-cyan hover:text-white transition-colors">
          MANAGE SOURCES
        </a>
      </div>

      {error ? (
        <div role="alert" className="card-cyber p-8 text-center border-neon-magenta/40">
          <p className="text-neon-magenta text-lg font-mono">SOURCE DATA UNAVAILABLE</p>
          <p className="text-gray-500 text-sm mt-2">{error}</p>
        </div>
      ) : sources.length === 0 ? (
        <div role="status" className="card-cyber p-8 text-center">
          <p className="text-gray-500 text-lg font-mono">NO SITEMAP SOURCES CONFIGURED</p>
        </div>
      ) : (
        <div className="card-cyber overflow-x-auto scrollbar-cyber">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-gray-800 text-xs text-gray-500 font-mono uppercase">
              <tr>
                <th scope="col" className="px-5 py-4">Source</th>
                <th scope="col" className="px-5 py-4">State</th>
                <th scope="col" className="px-5 py-4">Baseline</th>
                <th scope="col" className="px-5 py-4">Last successful scan</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id} className="border-b border-gray-900 last:border-0">
                  <td className="px-5 py-4 align-top">
                    <span className="block text-neon-cyan font-semibold">{source.site || source.domain}</span>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block max-w-md text-xs text-gray-500 hover:text-white break-all mt-1"
                    >
                      {source.url}
                    </a>
                  </td>
                  <td className="px-5 py-4 align-top font-mono text-xs">
                    <span className={source.active === false ? 'text-gray-500' : 'text-neon-green'}>
                      {source.active === false ? 'PAUSED' : 'ACTIVE'}
                    </span>
                    <span className="block text-gray-400 mt-1">
                      {(source.lastScanStatus || 'never').toUpperCase()}
                    </span>
                    {source.lastError && <span className="block text-neon-magenta mt-1">{source.lastError}</span>}
                  </td>
                  <td className="px-5 py-4 align-top text-xs font-mono">
                    <span className={source.baselineEstablished ? 'text-neon-green' : 'text-gray-500'}>
                      {source.baselineEstablished ? 'READY' : 'PENDING'}
                    </span>
                    <span className="block text-gray-600 mt-1">{formatTimestamp(source.baselineAt)}</span>
                  </td>
                  <td className="px-5 py-4 align-top text-xs text-gray-400 font-mono whitespace-nowrap">
                    {formatTimestamp(source.lastSuccessfulScanAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
