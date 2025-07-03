import { TinaNodeBackend, LocalBackendAuthProvider } from '@tinacms/datalayer'
import { TinaAuthJSOptions, AuthJsBackendAuthProvider } from 'tinacms-authjs'
import databaseClient from '../../../tina/__generated__/databaseClient'
import database from '../../../tina/database'

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === 'true'

const handler = TinaNodeBackend({
  authProvider: isLocal
    ? LocalBackendAuthProvider()
    : AuthJsBackendAuthProvider({
        authOptions: TinaAuthJSOptions({
          databaseClient: databaseClient,
          secret: process.env.NEXTAUTH_SECRET,
        }),
      }),
  databaseClient,
  database,
})

export default (req, res) => {
  return handler(req, res)
} 