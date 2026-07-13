'use server'

import { redirect } from 'next/navigation'

export default function Redirect() {
  redirect('/human-resources/leave-management')
}
