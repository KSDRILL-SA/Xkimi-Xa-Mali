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
  // A week, where the NextAuth default is thirty days. Members visit this app
  // once or twice a month, so a week is still generous, and it bounds how long
  // a session lifted from an unattended phone stays useful.
  //
  // This is an idle window, not a hard expiry: maxAge is measured from the last
  // refresh and updateAge controls how often that happens, so anyone using the
  // app regularly is never signed out mid-use. The admin portal, which can move
  // money, holds itself to a single day.
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
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
        token.status = (user as { status?: string }).status ?? 'ACTIVE'
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.roles = token.roles as string[]
      session.user.roleVersion = token.roleVersion as number
      session.user.status = token.status as string
      return session
    },
  },
} satisfies NextAuthConfig
