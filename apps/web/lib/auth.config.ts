import type { NextAuthConfig } from 'next-auth'
import { env } from './env'

// Edge-safe slice of the NextAuth config — no Prisma adapter, no Credentials
// provider, nothing that touches the database. Importing the full ./auth here
// would pull PrismaClient (process.on, globalThis singletons, DB connections)
// into the Edge Runtime middleware bundle, which doesn't support those Node.js
// APIs and made middleware execution unstable.
export const authConfig = {
  secret: env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.roles = (user as { roles?: string[] }).roles ?? []
        token.roleVersion = (user as { roleVersion?: number }).roleVersion ?? 0
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.roles = token.roles as string[]
      session.user.roleVersion = token.roleVersion as number
      return session
    },
  },
} satisfies NextAuthConfig
