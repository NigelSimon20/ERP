'use client'

import { TrainingList } from '@/components/hr/TrainingList'

export default function TrainingsPage() {
  return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Training Management</h1>
          <p className="text-muted-foreground mt-2">Manage employee training programs and track participation</p>
        </div>
        <TrainingList />
      </div>
  )
}
