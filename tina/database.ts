import { createDatabase, createLocalDatabase } from '@tinacms/datalayer'
import { GitHubProvider } from 'tinacms-gitprovider-github'
import { Redis } from '@upstash/redis'
import { RedisLevel } from 'upstash-redis-level'

const isLocal = process.env.TINA_PUBLIC_IS_LOCAL === 'true'
const branch = process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main'

if (!branch) {
  throw new Error('No branch found. Make sure that you have set the GITHUB_BRANCH or process.env.VERCEL_GIT_COMMIT_REF environment variable.')
}

export default isLocal
  ? createLocalDatabase()
  : createDatabase({
      gitProvider: new GitHubProvider({
        repo: process.env.GITHUB_REPO || process.env.VERCEL_GIT_REPO_SLUG,
        owner: process.env.GITHUB_OWNER || process.env.VERCEL_GIT_REPO_OWNER,
        token: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
        branch,
      }),
      databaseAdapter: new RedisLevel({
        namespace: branch,
        redis: {
          url: process.env.KV_REST_API_URL,
          token: process.env.KV_REST_API_TOKEN,
        },
        debug: process.env.DEBUG === 'true' || false,
      }),
    }) 