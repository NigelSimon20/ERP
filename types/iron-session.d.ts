import 'iron-session'

declare module 'iron-session' {
  interface IronSessionData {
    userId: string
    companyId: string
    role: string
    name: string
    email: string
    isLoggedIn: boolean
    mustChangePassword?: boolean
    guardId?: string
  }
}
