import { TinaNodeBackend } from '@tinacms/datalayer'
import databaseClient from '../../../tina/__generated__/databaseClient'

// Simple authentication provider that matches TinaCMS's expected interface
const simpleAuthProvider = {
  authenticate: async (credentials: { username: string; password: string }) => {
    if (credentials.username === 'spaceman' && credentials.password === 'admin123') {
      return {
        id: 'spaceman',
        name: 'spaceman',
        email: 'cfurlong@gmail.com',
        role: 'admin',
      }
    }
    return null
  },
}

export default TinaNodeBackend({
  authProvider: simpleAuthProvider,
  databaseClient,
}) 