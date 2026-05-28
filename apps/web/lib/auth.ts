import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { LoginSchema } from './validation/auth'
import { authConfig } from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
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

        if (user.status === 'PENDING') {
          throw new Error('EMAIL_NOT_VERIFIED')
        }

        if (user.status === 'SUSPENDED') {
          throw new Error('ACCOUNT_SUSPENDED')
        }

        const valid = await bcrypt.compare(parsed.data.password, user.password)
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          roles: user.roles.map((ur) => ur.role.name),
        }
      },
    }),
  ],
})
