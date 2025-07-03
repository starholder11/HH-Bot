import { NextApiRequest, NextApiResponse } from 'next'
import { Redis } from '@upstash/redis'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' })
    }

    // Initialize Redis connection
    const redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })

    // Check if admin user already exists
    const existingUser = await redis.get('tina:users:admin')
    if (existingUser) {
      return res.status(400).json({ error: 'Admin user already exists' })
    }

    // Create admin user in TinaCMS format
    const adminUser = {
      id: username,
      username,
      email,
      password: Buffer.from(password).toString('base64'), // Simple encoding
      role: 'admin',
      createdAt: new Date().toISOString(),
    }

    // Store in Redis with TinaCMS user key format
    await redis.set(`tina:users:${username}`, adminUser)
    await redis.set('tina:users:admin', adminUser) // Also store as admin for compatibility

    res.status(200).json({ 
      success: true, 
      message: 'Admin user created successfully',
      user: { username, email, role: 'admin' }
    })

  } catch (error) {
    console.error('Create admin error:', error)
    res.status(500).json({ 
      error: 'Failed to create admin user',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
} 