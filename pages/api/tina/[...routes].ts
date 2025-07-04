import { TinaNodeBackend } from '@tinacms/datalayer'
import databaseClient from '../../../tina/__generated__/databaseClient'

export default TinaNodeBackend({
  authProvider: {
    type: 'credentials',
    users: [
      {
        name: 'spaceman',
        email: 'cfurlong@gmail.com',
        password: 'admin123',
      },
    ],
  },
  databaseClient,
}) 