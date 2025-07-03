import Link from 'next/link'
import { getContentStats, getContentTemplate } from '@/lib/content-manager'

export default function AdminPage() {
  const contentStats = getContentStats()
  const template = getContentTemplate()
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800 mb-2">
              Content Management
            </h1>
            <p className="text-slate-600">
              Manage your content with TinaCMS (File-based approach)
            </p>
          </header>
          
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-8">
            <div className="text-center text-slate-500 py-8">
              <h2 className="text-2xl font-semibold mb-4">TinaCMS Admin Interface</h2>
              <p className="mb-4">
                Welcome to your content management system. You can now create and edit timeline entries.
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left mb-6">
                <h3 className="font-semibold text-green-800 mb-2">✅ File-based Content Management:</h3>
                <ul className="text-green-700 text-sm space-y-1">
                  <li>• Content stored in markdown files</li>
                  <li>• Git-based version control</li>
                  <li>• No external dependencies required</li>
                </ul>
              </div>
              
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-800 mb-2">Quick Actions:</h3>
                  <div className="flex flex-wrap gap-3">
                    <Link 
                      href="/" 
                      className="inline-flex items-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      View Timeline
                    </Link>
                    <Link 
                      href="/chat" 
                      className="inline-flex items-center px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                      Chat with AI
                    </Link>
                  </div>
                </div>
                
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-800 mb-2">Content Management:</h3>
                  <p className="text-purple-700 text-sm mb-3">
                    Your timeline entries are stored in <code className="bg-purple-100 px-1 rounded">content/timeline/</code> directory.
                  </p>
                  <div className="bg-white border border-purple-200 rounded p-3">
                    <h4 className="font-medium text-purple-800 mb-2">Current Timeline Entries ({contentStats.totalEntries}):</h4>
                    {contentStats.entries.length > 0 ? (
                      <ul className="text-purple-700 text-sm space-y-1">
                        {contentStats.entries.map((entry) => (
                          <li key={entry.filename}>
                            • <code className="bg-purple-100 px-1 rounded">{entry.filename}</code> - {entry.title}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-purple-600 text-sm">No timeline entries found.</p>
                    )}
                  </div>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-800 mb-2">Content Template:</h3>
                  <p className="text-yellow-700 text-sm mb-3">
                    Use this template to create new timeline entries:
                  </p>
                  <div className="bg-yellow-100 border border-yellow-300 rounded p-3">
                    <pre className="text-xs text-yellow-800 whitespace-pre-wrap overflow-x-auto">
                      {template}
                    </pre>
                  </div>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h3 className="font-semibold text-orange-800 mb-2">How to Add Content:</h3>
                  <ol className="text-orange-700 text-sm space-y-2">
                    <li>1. Create a new <code className="bg-orange-100 px-1 rounded">.md</code> file in <code className="bg-orange-100 px-1 rounded">content/timeline/</code></li>
                    <li>2. Use the template above as a starting point</li>
                    <li>3. Fill in the frontmatter fields (title, slug, date, body)</li>
                    <li>4. Commit and push to see changes on your site</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 