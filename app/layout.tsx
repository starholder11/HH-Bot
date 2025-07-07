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
        {children}
      </body>
    </html>
  )
} 