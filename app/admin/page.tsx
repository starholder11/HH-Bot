import { TinaProvider } from "tinacms/dist/admin";
import config from "../../tina/config";

export default function AdminPage() {
  return (
    <TinaProvider config={config}>
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
              <div id="tina-admin" className="min-h-[600px]">
                {/* TinaCMS admin interface will be rendered here */}
                <div className="text-center text-slate-500 py-8">
                  <p>TinaCMS admin interface loading...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TinaProvider>
  );
} 