import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roles: string[]
      roleVersion: number
      // Declared once. There was a second, optional `status?: string` above
      // `roleVersion` — a stray line that made this a duplicate identifier
      // (TS2300) with conflicting optionality (TS2687). It never surfaced
      // because `skipLibCheck` exempts `.d.ts` files from checking, so the
      // error sat in the type that decides what every `session.user` is.
      status: string
    } & DefaultSession['user']
  }

  interface User {
    roles?: string[]
    roleVersion?: number
    status?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    roles: string[]
    roleVersion: number
  }
}
