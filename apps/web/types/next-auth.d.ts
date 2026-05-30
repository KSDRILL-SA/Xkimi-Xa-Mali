import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roles: string[]
      roleVersion: number
    } & DefaultSession['user']
  }

  interface User {
    roles?: string[]
    roleVersion?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    roles: string[]
    roleVersion: number
  }
}
