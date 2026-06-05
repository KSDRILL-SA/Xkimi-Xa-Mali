import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { env } from './env'
import { LoginSchema } from '@xxm/utils/schemas'

const MAX_LOGIN_ATTEMPTS = env.MAX_LOGIN_ATTEMPTS
const LOCKOUT_DURATION_MS = env.LOCKOUT_DURATION_MINUTES * 60 * 1000

async function recordLoginHistory(userId: string, success: boolean) {
  await db.loginHistory
    .create({ data: { userId, success } })
    .catch(() => {})
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          include: { roles: { include: { role: true } } },
        })

        if (!user?.password) return null
        if (user.deletedAt) return null

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('ACCOUNT_LOCKED')
        }
        if (user.status === 'SUSPENDED') throw new Error('ACCOUNT_SUSPENDED')
        if (user.status === 'PENDING') throw new Error('ACCOUNT_PENDING')

        // Always run bcrypt before checking role — prevents timing-based admin email enumeration
        const valid = await bcrypt.compare(parsed.data.password, user.password)
        const roleNames = user.roles.map((ur) => ur.role.name)

        if (!valid || !roleNames.includes('ADMIN')) {
          if (!roleNames.includes('ADMIN')) {
            // Don't increment attempts for non-admin accounts
            await recordLoginHistory(user.id, false)
            return null
          }
          const newAttempts = user.loginAttempts + 1
          const lockout = newAttempts >= MAX_LOGIN_ATTEMPTS
          await db.user.update({
            where: { id: user.id },
            data: {
              loginAttempts: newAttempts,
              ...(lockout && { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) }),
            },
          })
          await recordLoginHistory(user.id, false)
          return null
        }

        if (user.loginAttempts > 0 || user.lockedUntil) {
          await db.user.update({
            where: { id: user.id },
            data: { loginAttempts: 0, lockedUntil: null },
          })
        }

        await recordLoginHistory(user.id, true)

        return {
          id:    user.id,
          email: user.email,
          name:  `${user.firstName} ${user.lastName}`,
          roles: roleNames,
          roleVersion: user.roleVersion,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id    = user.id
        token.roles = (user as { roles?: string[] }).roles ?? []
        token.roleVersion = (user as { roleVersion?: number }).roleVersion ?? 0
      }
      return token
    },
    session({ session, token }) {
      session.user.id    = token.id as string
      session.user.roles = (token.roles as string[] | undefined) ?? []
      session.user.roleVersion = token.roleVersion as number
      return session
    },
  },
})
