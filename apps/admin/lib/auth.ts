import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { env } from './env'
import { LoginSchema } from '@xxm/utils/schemas'

const MAX_LOGIN_ATTEMPTS = env.MAX_LOGIN_ATTEMPTS
const LOCKOUT_DURATION_MS = env.LOCKOUT_DURATION_MINUTES * 60 * 1000

// Valid cost-12 bcrypt hash of a throwaway value — compared against when no
// account matches so a non-existent email costs the same time as a real one,
// closing the timing side-channel for email enumeration (SEC-S07).
const DECOY_HASH = '$2a$12$0qvDdA8aXMT/QLT7ggsLKess1fpkA0Uy07.gAmSqiJcZy7/AcziCi'

async function recordLoginHistory(userId: string, success: boolean) {
  await db.loginHistory
    .create({ data: { userId, success } })
    .catch(() => {})
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  trustHost: true,
  adapter: PrismaAdapter(db),
  // One day, against the member portal's seven and the NextAuth default of
  // thirty. This session can grant admin rights, approve mandates and suspend
  // members, so it is worth far more to an attacker than a member's and should
  // survive for correspondingly less time.
  //
  // An idle window rather than a hard expiry: refreshed hourly, so an admin
  // working through the day is never interrupted, while a session left open on
  // an unattended machine overnight is gone by morning.
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
    updateAge: 60 * 60,
  },
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

        // Constant-time reject for absent/soft-deleted accounts (SEC-S07).
        if (!user?.password || user.deletedAt) {
          await bcrypt.compare(parsed.data.password, DECOY_HASH)
          return null
        }

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
          // Atomic increment so parallel failed attempts cannot under-count and
          // evade the lockout threshold.
          const { loginAttempts: attempts } = await db.user.update({
            where: { id: user.id },
            data: { loginAttempts: { increment: 1 } },
            select: { loginAttempts: true },
          })
          if (attempts >= MAX_LOGIN_ATTEMPTS) {
            await db.user.update({
              where: { id: user.id },
              data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
            })
          }
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
