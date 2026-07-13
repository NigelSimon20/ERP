'use client'

import { createContext, useContext, ReactNode } from 'react'

export interface UserInfo {
  id: string
  name: string
  email: string
  role: string
  companyName: string
}

const UserContext = createContext<UserInfo>({
  id: '',
  name: '',
  email: '',
  role: '',
  companyName: '',
})

export function UserProvider({ value, children }: { value: UserInfo; children: ReactNode }) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useCurrentUser(): UserInfo {
  return useContext(UserContext)
}
