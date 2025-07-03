'use client'

import Link from 'next/link'

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Content Management</h1>
          
          <div className="grid gap-6 md:grid-cols-2">
            {/* Posts Management */}
            <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
              <h2 className="text-lg font-semibold text-blue-900 mb-3">Posts</h2>
              <p className="text-blue-700 mb-4">Manage blog posts and articles</p>
              <div className="space-y-2">
                <Link 
                  href="/admin/posts" 
                  className="block w-full bg-blue-600 text-white px-4 py-2 rounded-md text-center hover:bg-blue-700 transition-colors"
                >
                  View Posts
                </Link>
                <Link 
                  href="/admin/posts/new" 
                  className="block w-full bg-blue-100 text-blue-700 px-4 py-2 rounded-md text-center hover:bg-blue-200 transition-colors"
                >
                  Create New Post
                </Link>
              </div>
            </div>

            {/* Timeline Management */}
            <div className="bg-green-50 rounded-lg p-6 border border-green-200">
              <h2 className="text-lg font-semibold text-green-900 mb-3">Timeline</h2>
              <p className="text-green-700 mb-4">Manage timeline entries and milestones</p>
              <div className="space-y-2">
                <Link 
                  href="/admin/timeline" 
                  className="block w-full bg-green-600 text-white px-4 py-2 rounded-md text-center hover:bg-green-700 transition-colors"
                >
                  View Timeline
                </Link>
                <Link 
                  href="/admin/timeline/new" 
                  className="block w-full bg-green-100 text-green-700 px-4 py-2 rounded-md text-center hover:bg-green-200 transition-colors"
                >
                  Create New Entry
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <Link 
                href="/" 
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
              >
                View Homepage
              </Link>
              <Link 
                href="/chat" 
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
              >
                Open Chat
              </Link>
              <Link 
                href="/timeline" 
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
              >
                View Timeline
              </Link>
            </div>
          </div>

          {/* Status Info */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">Note</h4>
              <p className="text-sm text-yellow-700">
                This is a simplified admin interface. For full TinaCMS functionality, 
                content editing is currently done through file system or by running 
                <code className="bg-yellow-100 px-1 rounded">tinacms dev</code> locally.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 