'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, TargetArrowRegular } from '@fluentui/react-icons';

interface BudgetEntry { id: string; department: string; month: number; year: number; budgetedAmount: number; actualAmount: number; variance: number }
type FormValues = { department: string; month: string; year: string; budgetedAmount: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DEPARTMENTS_DEFAULT = ['Operations', 'Administration', 'HR', 'Finance', 'Sales', 'IT']

export default function PlanningPage() {
  const [budgets, setBudgets] = useState<BudgetEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()))

  const { register, handleSubmit, control, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { department: 'Operations', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()), budgetedAmount: '' },
  })

  async function fetchBudgets() {
    setLoading(true)
    try {
      const res = await fetch(`/api/finance/planning?year=${yearFilter}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load budgets'); setBudgets([]); return }
      setBudgets(json.budgets ?? [])
    } catch {
      toast.error('Network error loading budgets')
      setBudgets([])
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchBudgets() }, [yearFilter])

  const departments = useMemo(() => {
    const fromData = Array.from(new Set(budgets.map(b => b.department)))
    return fromData.length ? fromData : DEPARTMENTS_DEFAULT
  }, [budgets])

  function getBudget(dept: string, month: number) {
    return budgets.find(b => b.department === dept && b.month === month)
  }

  async function onSubmit(data: FormValues) {
    const res = await fetch('/api/finance/planning', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department: data.department, month: Number(data.month), year: Number(data.year), budgetedAmount: Number(data.budgetedAmount) }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    toast.success('Budget saved')
    setShowDialog(false); reset(); fetchBudgets()
  }

  const years = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i + 1))

  return (
    <div>
      <PageHeader title="Budget Planning" description="Set and track budgets vs actuals by department" action={<Button type="button" onClick={() => { reset(); setShowDialog(true) }} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> Set Budget</Button>} />

      <div className="mt-4 flex items-center gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card overflow-x-auto">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <table className="text-xs min-w-[900px] w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-32">Department</th>
                {MONTHS.map(m => <th key={m} className="text-right px-2 py-2.5 font-medium text-muted-foreground min-w-[80px]">{m}</th>)}
                <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Total Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {departments.map(dept => {
                const deptBudgets = MONTHS.map((_, i) => getBudget(dept, i + 1))
                const totalBudget = deptBudgets.reduce((s, b) => s + Number(b?.budgetedAmount ?? 0), 0)
                return (
                  <tr key={dept} className="hover:bg-muted/50">
                    <td className="px-3 py-2.5 font-medium text-foreground">{dept}</td>
                    {deptBudgets.map((b, i) => (
                      <td key={i} className="px-2 py-2.5 text-right">
                        {b ? (
                          <div>
                            <p className="font-medium text-foreground">{formatCurrency(Number(b.budgetedAmount)).replace('$', '')}</p>
                            {Number(b.actualAmount) > 0 && (
                              <p className={`text-xs ${Number(b.variance) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {Number(b.variance) >= 0 ? '▲' : '▼'} {formatCurrency(Math.abs(Number(b.variance))).replace('$', '')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button type="button" onClick={() => { reset({ department: dept, month: String(i + 1), year: yearFilter, budgetedAmount: '' }); setShowDialog(true) }} className="text-brand-muted-light hover:text-primary hover:underline" aria-label={`Set ${dept} budget for ${MONTHS[i]}`}>Set</button>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-bold text-foreground">{totalBudget > 0 ? formatCurrency(totalBudget) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-brand-muted-light px-1">
        <span>Top row = Budget · Below = Variance (▲ under = savings, ▼ over = overspend)</span>
        <span className="flex items-center gap-1"><TargetArrowRegular className="h-3 w-3 text-primary" /> Click &quot;Set&quot; in any cell to enter a budget</span>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Set Budget</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Controller control={control} name="department" render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DEPARTMENTS_DEFAULT.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Controller control={control} name="month" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Controller control={control} name="year" render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="space-y-1.5"><Label>Budgeted Amount *</Label><Input type="number" step="0.01" min="0" placeholder="0.00" {...register('budgetedAmount', { required: true })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-brand-red-dark text-white">{isSubmitting ? 'Saving…' : 'Save Budget'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
