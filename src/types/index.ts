export type Role = 'admin' | 'technician' | 'manager'

export type OrderStatus =
  | 'New'
  | 'Assigned'
  | 'In Progress'
  | 'Job Done'
  | 'Reviewed'
  | 'Closed'
  | 'Cancelled'

export interface Technician {
  id: string
  name: string
  phone: string | null
  active: boolean
}

export interface Order {
  id: string
  order_no: string
  customer_name: string
  phone: string
  address: string
  problem_description: string
  service_type: string
  quoted_price: number
  assigned_technician_id: string | null
  admin_notes: string | null
  status: OrderStatus
  scheduled_at: string | null
  created_at: string
  technicians?: Technician | null
}

export interface ServiceCompletion {
  id: string
  order_id: string
  work_done: string
  extra_charges: number
  final_amount: number
  remarks: string | null
  technician_name: string
  started_at: string | null
  completed_at: string
  payment_amount: number | null
  payment_method: string | null
  receipt_photo_url: string | null
}

export interface CompletionAttachment {
  id: string
  service_completion_id: string
  file_url: string
  file_type: string
}

export interface AuditLogEntry {
  id: string
  order_id: string
  action: string
  actor_role: Role
  actor_name: string
  created_at: string
  orders?: { order_no: string } | null
}

export interface Reschedule {
  id: string
  order_id: string
  previous_scheduled_at: string | null
  new_scheduled_at: string | null
  reason: string | null
  changed_by_name: string
  created_at: string
}

export const SERVICE_TYPES = [
  'Aircond cleaning',
  'Aircond repair',
  'Gas refill',
  'Installation',
  'Inspection',
] as const

export const MOCK_TECHNICIANS = ['Ali', 'John', 'Bala', 'Yusoff'] as const
