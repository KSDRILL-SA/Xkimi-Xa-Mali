import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      roles: string[]
    status?: string
      roleVersion: number
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
