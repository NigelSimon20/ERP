export type TrainingStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type ParticipantStatus = 'REGISTERED' | 'ATTENDED' | 'ABSENT' | 'PASSED' | 'FAILED'

export interface Training {
  id: string
  companyId: string
  title: string
  description?: string
  category: string
  trainer?: string
  location?: string
  startDate: Date
  endDate: Date
  durationHours: number
  status: TrainingStatus
  mandatory: boolean
  notes?: string
  createdAt: Date
  updatedAt: Date
  participants?: TrainingParticipant[]
}

export interface TrainingParticipant {
  id: string
  trainingId: string
  guardId: string
  attendance: ParticipantStatus
  score?: number
  passed?: boolean
  notes?: string
  guard?: {
    id: string
    first_name?: string
    last_name?: string
    full_name?: string
    employee_code?: string
  }
}

export interface TrainingCreate {
  title: string
  description?: string
  category: string
  trainer?: string
  location?: string
  startDate: string
  endDate: string
  durationHours: number
  mandatory?: boolean
  notes?: string
  participants?: string[] // guardIds
}

export interface TrainingUpdate {
  title?: string
  description?: string
  category?: string
  trainer?: string
  location?: string
  startDate?: string
  endDate?: string
  durationHours?: number
  status?: TrainingStatus
  mandatory?: boolean
  notes?: string
}

export interface TrainingParticipantUpdate {
  attendance?: ParticipantStatus
  score?: number
  passed?: boolean
  notes?: string
}
