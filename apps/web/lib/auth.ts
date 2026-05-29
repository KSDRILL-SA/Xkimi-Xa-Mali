import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { LoginSchema } from './validation/auth'
import { logger } from './logger'

const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000

async function recordLoginHistory(userId: string, success: boolean) {
  await db.loginHistory
    .create({ data: { userId, success } })
    .catch(() => {}) // non-critical — never let audit failure break login
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
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

        // Account lockout check — checked before bcrypt to short-circuit fast
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
          logger.warn('Login blocked — account locked', { userId: user.id, minutesLeft })
          throw new Error('ACCOUNT_LOCKED')
        }

        if (user.status === 'PENDING') throw new Error('EMAIL_NOT_VERIFIED')
        if (user.status === 'SUSPENDED') throw new Error('ACCOUNT_SUSPENDED')

        const valid = await bcrypt.compare(parsed.data.password, user.password)

        if (!valid) {
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
          logger.warn('Failed login attempt', {
            userId: user.id,
            attempts: newAttempts,
            locked: lockout,
          })
          return null
        }

        // Successful login — reset lockout counters
        if (user.loginAttempts > 0 || user.lockedUntil) {
          await db.user.update({
            where: { id: user.id },
            data: { loginAttempts: 0, lockedUntil: null },
          })
        }

        await recordLoginHistory(user.id, true)

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          roles: user.roles.map((ur) => ur.role.name),
        }
      },
    }),
  ],
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
})
