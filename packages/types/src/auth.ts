export type SessionUser = {
  id: string
  email: string
  name: string
  roles: string[]
}

export type AuthSession = {
  user: SessionUser
  expires: string
}
