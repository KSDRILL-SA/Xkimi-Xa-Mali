import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-safe Auth.js config — used by middleware.
 * Do not import Prisma, bcrypt, or CredentialsSignin here.
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
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
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.roles = token.roles as string[]
      return session
    },
  },
} satisfies NextAuthConfig
