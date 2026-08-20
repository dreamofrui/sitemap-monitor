import { Discovery } from '@/lib/supabase'
import { motion } from 'framer-motion'

interface RecentDiscoveriesProps {
  discoveries: Discovery[]
  error?: string
}

export default function RecentDiscoveries({ discoveries, error }: RecentDiscoveriesProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="mb-12"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h2 className="text-3xl font-bold">
          <span className="text-neon-magenta">RECENT</span>{' '}
          <span className="text-white">DISCOVERED URLS</span>
        </h2>
        <span className="text-xs text-gray-500 font-mono">POST-BASELINE EVIDENCE</span>
      </div>

      {error ? (
        <div role="alert" className="card-cyber p-8 text-center border-neon-magenta/40">
          <p className="text-neon-magenta text-lg font-mono">DISCOVERY DATA UNAVAILABLE</p>
          <p className="text-gray-500 text-sm mt-2">{error}</p>
        </div>
      ) : discoveries.length === 0 ? (
        <div role="status" className="card-cyber p-8 text-center">
          <p className="text-gray-500 text-lg font-mono">NO NEW URL EVIDENCE YET</p>
          <p className="text-gray-600 text-sm mt-2">Successful scans will appear here after a source baseline is ready.</p>
        </div>
      ) : (
        <div className="card-cyber overflow-x-auto scrollbar-cyber">
          <table className="w-full text-left min-w-[760px]">
            <thead className="border-b border-gray-800 text-xs text-gray-500 font-mono uppercase">
              <tr>
                <th scope="col" className="px-5 py-4">Phrase</th>
                <th scope="col" className="px-5 py-4">Discovered URL</th>
                <th scope="col" className="px-5 py-4">Source Sitemap</th>
                <th scope="col" className="px-5 py-4">First Seen</th>
              </tr>
            </thead>
            <tbody>
              {discoveries.map((discovery) => (
                <tr key={discovery.id} className="border-b border-gray-900 last:border-0 hover:bg-cyber-dark/40">
                  <td className="px-5 py-4 align-top">
                    <span className={discovery.phrase ? 'text-neon-cyan font-semibold' : 'text-gray-600'}>
                      {discovery.phrase || 'NO PATH PHRASE'}
                    </span>
                    {discovery.excluded && (
                      <span className="block text-xs text-neon-magenta font-mono mt-1">EXCLUDED FROM SIGNALS</span>
                    )}
                    {discovery.rawSegment && (
                      <span className="block text-xs text-gray-600 font-mono mt-1">/{discovery.rawSegment}</span>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top max-w-[320px]">
                    <a
                      href={discovery.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-300 hover:text-neon-cyan break-all"
                    >
                      {discovery.originalUrl}
                    </a>
                    <span className="block text-xs text-gray-600 font-mono mt-1">{discovery.site}</span>
                  </td>
                  <td className="px-5 py-4 align-top max-w-[220px]">
                    {discovery.sourceUrl ? (
                      <a
                        href={discovery.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:text-neon-magenta break-all"
                      >
                        {discovery.sourceUrl}
                      </a>
                    ) : (
                      <span className="text-xs text-gray-600">UNAVAILABLE</span>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top text-xs text-gray-500 font-mono whitespace-nowrap">
                    {new Date(discovery.firstSeenAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.section>
  )
}
