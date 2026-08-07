import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      roles: string[]
      roleVersion: number
    }
  }
  interface User {
    roles?: string[]
    roleVersion?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    roles?: string[]
    roleVersion?: number
  }
}
