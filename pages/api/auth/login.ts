import { NextApiRequest, NextApiResponse } from 'next'
import { Redis } from '@upstash/redis'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    // Check environment variables
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      return res.status(500).json({ 
        error: 'Redis configuration missing',
        details: 'KV_REST_API_URL and KV_REST_API_TOKEN must be set'
      })
    }

    // Initialize Redis connection
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })

    // Get user from Redis
    const user = await redis.get(`tina:users:${username}`) as any
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Check password
    const storedPassword = Buffer.from(password).toString('base64')
    if (user.password !== storedPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    // Create session
    const session = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    }

    // Store session in Redis
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    await redis.set(`tina:sessions:${sessionId}`, session, { ex: 24 * 60 * 60 }) // 24 hours expiry

    // Set session cookie
    res.setHeader('Set-Cookie', `tina-session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${24 * 60 * 60}`)

    res.status(200).json({ 
      success: true, 
      user: session.user
    })

  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ 
      error: 'Login failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
} 