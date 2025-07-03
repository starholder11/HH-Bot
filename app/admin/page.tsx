export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <header className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800 mb-2">
              Content Management
            </h1>
            <p className="text-slate-600">
              Manage your content with TinaCMS
            </p>
          </header>
          
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-8">
            <div className="text-center text-slate-500 py-8">
              <h2 className="text-2xl font-semibold mb-4">TinaCMS Admin Interface</h2>
              <p className="mb-4">
                TinaCMS configuration is ready. The admin interface will be available once authentication is configured.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                <h3 className="font-semibold text-blue-800 mb-2">Next Steps:</h3>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• Configure TinaCMS authentication tokens</li>
                  <li>• Set up environment variables (NEXT_PUBLIC_TINA_CLIENT_ID, TINA_TOKEN)</li>
                  <li>• Initialize TinaCMS admin interface</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 