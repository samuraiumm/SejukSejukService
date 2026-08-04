import type { OrderStatus, Role } from '../types'

/** Allowed forward transitions and which role may perform them. */
const TRANSITIONS: Record<OrderStatus, { next: OrderStatus | null; allowedRole: Role }> = {
  New: { next: 'Assigned', allowedRole: 'admin' },
  Assigned: { next: 'In Progress', allowedRole: 'technician' },
  'In Progress': { next: 'Job Done', allowedRole: 'technician' },
  'Job Done': { next: 'Reviewed', allowedRole: 'manager' },
  Reviewed: { next: 'Closed', allowedRole: 'manager' },
  Closed: { next: null, allowedRole: 'manager' },
  Cancelled: { next: null, allowedRole: 'admin' },
}

/** Orders can only be cancelled before a technician has started work on them. */
const CANCELLABLE_STATUSES: OrderStatus[] = ['New', 'Assigned']

export function canTransition(status: OrderStatus, role: Role): boolean {
  const rule = TRANSITIONS[status]
  return rule.next !== null && rule.allowedRole === role
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  return TRANSITIONS[status].next
}

export function canCancel(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status)
}

export const STATUS_ORDER: OrderStatus[] = [
  'New',
  'Assigned',
  'In Progress',
  'Job Done',
  'Reviewed',
  'Closed',
  'Cancelled',
]
