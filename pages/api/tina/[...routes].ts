import { TinaNodeBackend } from '@tinacms/datalayer'
import { AuthJsBackendAuthProvider, TinaAuthJSOptions } from 'tinacms-authjs'
import databaseClient from '../../../tina/__generated__/databaseClient'

// Validate required environment variables
if (!process.env.NEXTAUTH_SECRET) {
  throw new Error('NEXTAUTH_SECRET environment variable is required')
}

export default TinaNodeBackend({
  authProvider: AuthJsBackendAuthProvider({
    authOptions: TinaAuthJSOptions({
      databaseClient,
      secret: process.env.NEXTAUTH_SECRET,
    }),
  }),
  databaseClient,
}) 