import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { Redis } from '@upstash/redis'

export default NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        try {
          // Initialize Redis connection
          const redis = new Redis({
            url: process.env.KV_REST_API_URL!,
            token: process.env.KV_REST_API_TOKEN!,
          })

          // Get user from Redis
          const user = await redis.get(`tina:users:${credentials.username}`) as any
          if (!user) {
            return null
          }

          // Check password
          const storedPassword = Buffer.from(credentials.password).toString('base64')
          if (user.password !== storedPassword) {
            return null
          }

          return {
            id: user.id,
            name: user.username,
            email: user.email,
            role: user.role,
          }
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role
      }
      return session
    }
  },
  pages: {
    signIn: '/admin',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}) 