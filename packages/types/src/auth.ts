export type SessionUser = {
  id: string
  email: string
  name: string
  roles: string[]
  roleVersion: number
}

export type AuthSession = {
  user: SessionUser
  expires: string
}
