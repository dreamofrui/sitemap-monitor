import { DemandSignal } from '@/lib/supabase'
import { motion } from 'framer-motion'

interface DemandSignalsProps {
  signals: DemandSignal[]
  error?: string
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function DemandSignals({ signals, error }: DemandSignalsProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.25 }}
      className="mb-12"
      aria-labelledby="demand-signals-heading"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h2 id="demand-signals-heading" className="text-3xl font-bold">
            <span className="text-neon-cyan">DEMAND</span>{' '}
            <span className="text-white">SIGNALS</span>
          </h2>
          <p className="text-sm text-gray-500 font-mono mt-2">
            PRIORITIZED BY DISTINCT SITES, OCCURRENCES, AND RECENCY
          </p>
        </div>
        <span className="text-xs text-gray-500 font-mono">POST-BASELINE AGGREGATES</span>
      </div>

      {error ? (
        <div role="alert" className="card-cyber p-8 text-center border-neon-magenta/40">
          <p className="text-neon-magenta text-lg font-mono">SIGNAL DATA UNAVAILABLE</p>
          <p className="text-gray-500 text-sm mt-2">{error}</p>
        </div>
      ) : signals.length === 0 ? (
        <div role="status" className="card-cyber p-8 text-center">
          <p className="text-gray-500 text-lg font-mono">NO CROSS-SITE SIGNALS YET</p>
          <p className="text-gray-600 text-sm mt-2">Signals appear after post-baseline URLs are discovered.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {signals.map((signal, index) => (
            <details key={signal.phrase} className="card-cyber group overflow-hidden">
              <summary className="cursor-pointer list-none px-5 py-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-gray-600 font-mono">{String(index + 1).padStart(2, '0')}</span>
                      <span className="text-lg text-neon-cyan font-semibold break-words">{signal.phrase}</span>
                      {signal.priority && (
                        <span className="text-xs font-mono text-neon-green border border-neon-green/40 px-2 py-1 rounded">
                          PRIORITY
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-2">
                      {signal.sites.join(' | ')}
                    </p>
                  </div>
                  <div className="text-left lg:text-right">
                    <span className="block text-xs text-gray-600 font-mono uppercase">Sites</span>
                    <span className="text-white font-semibold">{signal.distinctSiteCount}</span>
                  </div>
                  <div className="text-left lg:text-right">
                    <span className="block text-xs text-gray-600 font-mono uppercase">URLs</span>
                    <span className="text-white font-semibold">{signal.occurrenceCount}</span>
                  </div>
                  <div className="text-left lg:text-right">
                    <span className="block text-xs text-gray-600 font-mono uppercase">Last seen</span>
                    <span className="text-gray-300 text-sm">{formatDate(signal.lastSeenAt)}</span>
                  </div>
                </div>
              </summary>

              <div className="border-t border-gray-800/70 px-5 py-5 bg-cyber-darker/40">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-5 text-xs font-mono">
                  <div>
                    <span className="block text-gray-600 uppercase mb-1">First seen</span>
                    <span className="text-gray-300">{formatDate(signal.firstSeenAt)}</span>
                  </div>
                  <div>
                    <span className="block text-gray-600 uppercase mb-1">Sites contributing</span>
                    <span className="text-gray-300">{signal.sites.join(', ')}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {signal.occurrences.map((occurrence) => (
                    <div key={`${occurrence.sourceId}:${occurrence.canonicalUrl}`} className="border-l-2 border-neon-cyan/30 pl-4">
                      <a
                        href={occurrence.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-300 hover:text-neon-cyan break-all"
                      >
                        {occurrence.url}
                      </a>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 font-mono mt-1">
                        <span>{occurrence.site}</span>
                        <span>/{occurrence.rawSegment}</span>
                        <span>FIRST {formatDate(occurrence.firstSeenAt)}</span>
                        <span>LAST {formatDate(occurrence.lastSeenAt)}</span>
                        {occurrence.sourceUrl && (
                          <a
                            href={occurrence.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-500 hover:text-neon-magenta break-all"
                          >
                            SITEMAP: {occurrence.sourceUrl}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </motion.section>
  )
}
