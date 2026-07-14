'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AddRegular as Plus, BookOpenRegular as BookOpen, CalendarLtrRegular as Calendar, DeleteRegular as Trash2, EditRegular as Edit2, PeopleRegular as Users } from '@fluentui/react-icons';

interface Training {
  id: string
  title: string
  category: string
  startDate: string
  endDate: string
  status: string
  mandatory: boolean
  durationHours: number
  trainer?: string
  location?: string
  participants?: any[]
}

export function TrainingList() {
  const [trainings, setTrainings] = useState<Training[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchTrainings()
  }, [page])

  const fetchTrainings = async () => {
    try {
      const res = await fetch(`/api/hr/trainings?page=${page}`)
      const data = await res.json()
      setTrainings(data.trainings)
    } catch (err) {
      console.error('Failed to fetch trainings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return
    try {
      await fetch(`/api/hr/trainings/${id}`, { method: 'DELETE' })
      fetchTrainings()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const getStatusColor = (status: string) => {
    return {
      SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400',
      IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
      COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
      CANCELLED: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-red-300',
    }[status] || 'bg-muted text-foreground'
  }

  if (loading) return <div className="text-center py-8">Loading...</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Training Programs</h2>
        <Button className="flex gap-2">
          <Plus fontSize={18} />
          New Training
        </Button>
      </div>

      <div className="grid gap-4">
        {trainings.map((training) => (
          <Card key={training.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{training.title}</CardTitle>
                  <CardDescription>{training.category}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge className={getStatusColor(training.status)}>
                    {training.status}
                  </Badge>
                  {training.mandatory && <Badge variant="outline">Mandatory</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar fontSize={16} className="text-muted-foreground" />
                  <span>{new Date(training.startDate).toLocaleDateString()} - {new Date(training.endDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen fontSize={16} className="text-muted-foreground" />
                  <span>{training.durationHours} hours</span>
                </div>
                {training.trainer && <div><strong>Trainer:</strong> {training.trainer}</div>}
                {training.location && <div><strong>Location:</strong> {training.location}</div>}
                <div className="flex items-center gap-2">
                  <Users fontSize={16} className="text-muted-foreground" />
                  <span>{training.participants?.length || 0} Participants</span>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex gap-2">
                  <Edit2 fontSize={16} />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex gap-2"
                  onClick={() => handleDelete(training.id)}
                >
                  <Trash2 fontSize={16} />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
