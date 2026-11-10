import { z } from 'zod'

const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(7, 'Invalid phone number'),
    whatsapp: z.string().optional(),
    companyName: z.string().min(2, 'Company name must be at least 2 characters'),
    password: z
      .string()
      .regex(
        passwordRegex,
        'Password must be at least 8 characters with 1 uppercase, 1 number, and 1 symbol'
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const deploymentSchema = z.object({
  guardId: z.string().min(1, 'Guard is required'),
  siteId: z.string().min(1, 'Site is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional(),
  shiftType: z.enum(['DAY', 'NIGHT', 'FULLDAY', 'ROTATING']),
  hoursPerDay: z.coerce.number().positive('Hours per day must be positive'),
  ratePerHour: z.coerce.number().positive('Rate per hour must be positive'),
  notes: z.string().optional(),
})

export const attendanceSchema = z.object({
  guardId: z.string().min(1, 'Guard is required'),
  siteId: z.string().min(1, 'Site is required'),
  date: z.string().min(1, 'Date is required'),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE']).default('PRESENT'),
  notes: z.string().optional(),
})

export const incidentSchema = z.object({
  siteId: z.string().min(1, 'Site is required'),
  guardId: z.string().optional(),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']).default('OPEN'),
  reportedAt: z.string().optional(),
  notes: z.string().optional(),
})

export const journalEntrySchema = z.object({
  entryDate: z.string().min(1, 'Entry date is required').refine((v) => !isNaN(new Date(v).getTime()), 'Entry date is not a valid date'),
  description: z.string().min(3, 'Description is required'),
  lines: z
    .array(
      z.object({
        accountId: z.string().min(1, 'Account is required'),
        description: z.string().optional(),
        debit: z.coerce.number().min(0, 'Debit must be 0 or greater'),
        credit: z.coerce.number().min(0, 'Credit must be 0 or greater'),
      })
    )
    .min(2, 'At least 2 lines required'),
})

export const salesInvoiceSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  description: z.string().optional(),
  // API clients send `notes`; the page sends `description`. Both are kept.
  notes: z.string().optional(),
  revenueAccountId: z.string().min(1, 'Revenue account is required'),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1, 'Description is required'),
        quantity: z.coerce.number().positive('Quantity must be positive'),
        unitPrice: z.coerce.number().positive('Unit price must be positive'),
        taxRate: z.coerce.number().min(0).max(100).default(0),
      })
    )
    .min(1, 'At least 1 line item required'),
})

export const paymentSchema = z.object({
  paymentDate: z.string().min(1, 'Payment date is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
  bankAccountId: z.string().min(1, 'Bank account is required'),
  entityType: z.string().min(1, 'Entity type is required'),
  entityId: z.string().min(1, 'Entity is required'),
  notes: z.string().optional(),
})

export const taskSchema = z
  .object({
    title: z.string().min(3, 'Title must be at least 3 characters'),
    description: z.string().optional(),
    assignedTo: z.string().min(1, 'Assignee is required'),
    dueDate: z.string().min(1, 'Due date is required'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    whatsappReminder: z.boolean().default(false),
    reminderTime: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.whatsappReminder && !data.reminderTime) return false
      if (data.whatsappReminder && data.reminderTime && data.dueDate) {
        return new Date(data.reminderTime) < new Date(data.dueDate)
      }
      return true
    },
    {
      message: 'Reminder time is required and must be before the due date',
      path: ['reminderTime'],
    }
  )

export const meetingSchema = z
  .object({
    title: z.string().min(3, 'Title must be at least 3 characters'),
    description: z.string().optional(),
    location: z.string().optional(),
    meetingDate: z.string().min(1, 'Meeting date is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    attendees: z.array(z.string()).min(1, 'At least 1 attendee is required'),
    whatsappReminder: z.boolean().default(false),
    reminderTime: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: 'End time must be after start time',
    path: ['endTime'],
  })

export const leadSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  contactName: z.string().min(2, 'Contact name is required'),
  contactPhone: z.string().min(7, 'Invalid phone number'),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  source: z.string().optional(),
  industry: z.string().optional(),
  estimatedValue: z.coerce.number().min(0, 'Value must be 0 or greater'),
  probability: z.coerce.number().int().min(0).max(100).default(0),
  status: z
    .enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'])
    .default('NEW'),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
})
