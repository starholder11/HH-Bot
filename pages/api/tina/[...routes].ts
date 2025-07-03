import { TinaNodeBackend } from '@tinacms/datalayer'
import { AuthJsBackendAuthProvider, TinaAuthJSOptions } from 'tinacms-authjs'
import databaseClient from '../../../tina/__generated__/databaseClient'
import database from '../../../tina/database'

export default TinaNodeBackend({
  authProvider: AuthJsBackendAuthProvider({
    authOptions: TinaAuthJSOptions({
      databaseClient,
      secret: process.env.NEXTAUTH_SECRET,
    }),
  }),
  databaseClient,
  database,
}) 