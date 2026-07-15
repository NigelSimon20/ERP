import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { computeEntryHash, GENESIS_HASH, OCCURRENCE_ENTRY_TYPES } from '@/lib/occurrence-book'
import crypto from 'crypto'

// No PUT/PATCH/DELETE handler exists in this file, and none should ever be
// added — the occurrence book is append-only by design. Corrections belong
// in a new entry that references the one being corrected, never an edit.

export async function GET(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = session
  const siteId = new URL(req.url).searchParams.get('siteId')
  if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 })

  const entries = await prisma.occurrenceEntry.findMany({
    where: { companyId, siteId },
    orderBy: { sequenceNumber: 'asc' },
  })

  // Re-verify the hash chain end-to-end on every read — a real check
  // against tampering/reordering, not a decorative badge.
  let expectedPrev = GENESIS_HASH
  let chainValid = true
  for (const e of entries) {
    const recomputed = computeEntryHash({
      siteId: e.siteId,
      sequenceNumber: e.sequenceNumber,
      entryType: e.entryType,
      narrative: e.narrative,
      recordedById: e.recordedById,
      occurredAt: e.occurredAt.toISOString(),
      previousHash: expectedPrev,
    })
    if (e.previousHash !== expectedPrev || e.entryHash !== recomputed) {
      chainValid = false
      break
    }
    expectedPrev = e.entryHash
  }

  return NextResponse.json({
    entries: entries
      .map((e) => ({ ...e, occurredAt: e.occurredAt.toISOString(), createdAt: e.createdAt.toISOString() }))
      .reverse(),
    chainValid,
  })
}

export async function POST(req: NextRequest) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.isLoggedIn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, userId, name: userName } = session
  const body = await req.json()
  const { siteId, entryType, narrative, occurredAt, linkedIncidentId } = body

  if (!siteId || !narrative?.trim()) {
    return NextResponse.json({ error: 'siteId and narrative are required' }, { status: 400 })
  }
  if (entryType && !OCCURRENCE_ENTRY_TYPES.includes(entryType)) {
    return NextResponse.json({ error: 'Invalid entry type' }, { status: 400 })
  }

  const last = await prisma.occurrenceEntry.findFirst({
    where: { siteId },
    orderBy: { sequenceNumber: 'desc' },
  })
  const sequenceNumber = (last?.sequenceNumber ?? 0) + 1
  const previousHash = last?.entryHash ?? GENESIS_HASH
  const occurredAtDate = occurredAt ? new Date(occurredAt) : new Date()
  const resolvedType = entryType ?? 'GENERAL'

  const entryHash = computeEntryHash({
    siteId,
    sequenceNumber,
    entryType: resolvedType,
    narrative: narrative.trim(),
    recordedById: userId,
    occurredAt: occurredAtDate.toISOString(),
    previousHash,
  })

  try {
    const entry = await prisma.occurrenceEntry.create({
      data: {
        id: crypto.randomUUID(),
        companyId,
        siteId,
        sequenceNumber,
        entryType: resolvedType,
        narrative: narrative.trim(),
        recordedById: userId,
        recordedByName: userName,
        occurredAt: occurredAtDate,
        linkedIncidentId: linkedIncidentId || null,
        previousHash,
        entryHash,
      },
    })

    await logAudit({
      companyId,
      userId,
      userName,
      action: 'CREATE',
      module: 'Operations',
      recordId: entry.id,
      newValues: { siteId, sequenceNumber, entryType: resolvedType, narrative: narrative.trim() },
    })

    return NextResponse.json({ entry: { ...entry, occurredAt: entry.occurredAt.toISOString(), createdAt: entry.createdAt.toISOString() } }, { status: 201 })
  } catch {
    // Most likely cause: a concurrent write to the same site landed on the
    // same sequenceNumber first and the unique (siteId, sequenceNumber)
    // index rejected this one — safe to ask the client to retry.
    return NextResponse.json({ error: 'Could not log entry — please retry' }, { status: 409 })
  }
}
