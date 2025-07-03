import { TinaNodeBackend, LocalBackendAuthProvider } from '@tinacms/datalayer'
import { TinaAuthJSOptions, AuthJsBackendAuthProvider } from 'tinacms-authjs'
import databaseClient from '../../../tina/__generated__/databaseClient'
import database from '../../../tina/database'

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === 'true'
const hasRequiredConfig = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN && process.env.GITHUB_PERSONAL_ACCESS_TOKEN
const hasAuthSecret = process.env.NEXTAUTH_SECRET

const handler = TinaNodeBackend({
  authProvider: isLocal || !hasRequiredConfig || !hasAuthSecret
    ? LocalBackendAuthProvider()
    : AuthJsBackendAuthProvider({
        authOptions: TinaAuthJSOptions({
          databaseClient: databaseClient,
          secret: process.env.NEXTAUTH_SECRET || 'fallback-secret',
        }),
      }),
  databaseClient,
  database,
})

export default (req, res) => {
  return handler(req, res)
} 