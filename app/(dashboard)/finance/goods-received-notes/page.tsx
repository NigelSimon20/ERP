'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { AddRegular, DocumentRegular } from '@fluentui/react-icons'

interface Grn { id: string; grnNumber: string; receivedBy: string; receivedAt: string; purchaseOrder: { id: string; poNumber: string } | null }
interface PoOption { id: string; poNumber: string; status: string; supplier: { id: string; name: string } }
interface PoLine { id: string; description: string; quantity: number; quantityReceived: number }

export default function GoodsReceivedNotesPage() {
  const [rows, setRows] = useState<Grn[]>([])
  const [pos, setPos] = useState<PoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedPoId, setSelectedPoId] = useState('')
  const [poLines, setPoLines] = useState<PoLine[]>([])
  const [receivedQty, setReceivedQty] = useState<Record<string, string>>({})
  const [receivedBy, setReceivedBy] = useState('')
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const receivablePos = useMemo(() => pos.filter((p) => ['SENT', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status)), [pos])

  async function fetchRows() {
    setLoading(true)
    try {
      const res = await fetch('/api/finance/goods-received-notes')
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'Failed to load goods received notes'); setRows([]); return }
      setRows(json.goodsReceivedNotes ?? [])
    } catch { toast.error('Network error loading goods received notes'); setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchRows() }, [])
  useEffect(() => {
    fetch('/api/finance/purchase-orders').then((r) => r.json()).then((j) => setPos(j.purchaseOrders ?? [])).catch((err) => console.error(err))
  }, [])

  async function selectPo(poId: string) {
    setSelectedPoId(poId)
    setPoLines([])
    setReceivedQty({})
    if (!poId) return
    const res = await fetch(`/api/finance/purchase-orders/${poId}`)
    const json = await res.json()
    if (!res.ok) { toast.error(json.error); return }
    const lines: PoLine[] = (json.purchaseOrder.lineItems ?? []).filter((l: PoLine) => l.quantityReceived < l.quantity)
    setPoLines(lines)
    setReceivedQty(Object.fromEntries(lines.map((l) => [l.id, String(l.quantity - l.quantityReceived)])))
  }

  function openCreate() {
    setSelectedPoId('')
    setPoLines([])
    setReceivedQty({})
    setReceivedBy('')
    setReceivedAt(new Date().toISOString().split('T')[0])
    setNotes('')
    setShowCreateDialog(true)
  }

  async function onCreate() {
    if (!selectedPoId) { toast.error('Select a purchase order'); return }
    if (!receivedBy) { toast.error('Enter who received the goods'); return }
    const lines = poLines
      .map((l) => ({ poLineId: l.id, quantityReceived: Number(receivedQty[l.id]) || 0 }))
      .filter((l) => l.quantityReceived > 0)
    if (lines.length === 0) { toast.error('Enter at least one received quantity'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/finance/goods-received-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseOrderId: selectedPoId, receivedBy, receivedAt, notes, lines }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error); return }
      toast.success(`Goods received note ${json.goodsReceivedNote.grnNumber} created`)
      setShowCreateDialog(false)
      fetchRows()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Goods Received Notes"
        description="Record goods received against approved purchase orders"
        action={<Button type="button" onClick={openCreate} className="bg-primary hover:bg-brand-red-dark text-white"><AddRegular className="h-4 w-4 mr-1" /> New GRN</Button>}
      />

      <div className="mt-4 rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="py-8 flex justify-center"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16"><EmptyState icon={DocumentRegular} title="No goods received notes found" description="Record your first goods receipt" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">GRN #</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Purchase Order</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Received By</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Received At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-primary font-semibold">{row.grnNumber}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{row.purchaseOrder?.poNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.receivedBy}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(new Date(row.receivedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Goods Received Note</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Purchase Order *</Label>
                <Select onValueChange={selectPo} value={selectedPoId}>
                  <SelectTrigger><SelectValue placeholder="Select purchase order" /></SelectTrigger>
                  <SelectContent>{receivablePos.map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber} — {p.supplier.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Received By *</Label>
                <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Name" />
              </div>
              <div className="space-y-1.5">
                <Label>Received At *</Label>
                <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
              </div>
            </div>

            {poLines.length > 0 && (
              <div>
                <div className="grid grid-cols-12 gap-2 mb-1 text-xs font-medium text-muted-foreground px-1">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-3 text-right">Outstanding</div>
                  <div className="col-span-3 text-right">Receiving Now</div>
                </div>
                <div className="space-y-2">
                  {poLines.map((l) => {
                    const outstanding = l.quantity - l.quantityReceived
                    return (
                      <div key={l.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-6 text-sm text-foreground">{l.description}</div>
                        <div className="col-span-3 text-right text-sm text-muted-foreground">{outstanding}</div>
                        <div className="col-span-3">
                          <Input className="h-8 text-xs text-right" type="number" step="1" min="0" max={outstanding} value={receivedQty[l.id] ?? ''} onChange={(e) => setReceivedQty((prev) => ({ ...prev, [l.id]: e.target.value }))} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button type="button" onClick={onCreate} disabled={submitting} className="bg-primary hover:bg-brand-red-dark text-white">{submitting ? 'Saving…' : 'Record Receipt'}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
