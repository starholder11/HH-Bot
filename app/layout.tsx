import type { Metadata } from 'next'
import './globals.css'
import { Search } from '@/components/search/Search'

export const metadata: Metadata = {
  title: 'HH Bot Chat',
  description: 'Chat with your AI assistant powered by OpenAI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 flex justify-between items-center h-16">
            <nav>{/* ...existing nav... */}</nav>
            <Search variant="compact" maxResults={5} />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
} 