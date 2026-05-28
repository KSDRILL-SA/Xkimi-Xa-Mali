import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials, { CredentialsSignin } from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { LoginSchema } from './validation/auth'

class EmailNotVerified extends CredentialsSignin {
  code = 'EMAIL_NOT_VERIFIED'
}

class AccountSuspended extends CredentialsSignin {
  code = 'ACCOUNT_SUSPENDED'
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
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

        if (user.status === 'PENDING') {
          throw new EmailNotVerified()
        }

        if (user.status === 'SUSPENDED') {
          throw new AccountSuspended()
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
