import { TinaNodeBackend, LocalBackendAuthProvider } from '@tinacms/datalayer'
import databaseClient from '../../../tina/__generated__/databaseClient'

export default TinaNodeBackend({
  authProvider: LocalBackendAuthProvider(), // Built-in, no auth needed for testing
  databaseClient,
}) 