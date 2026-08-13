/** Builds a wa.me deep link with a pre-filled message. No WhatsApp Business API needed. */
export function buildWhatsAppLink(phone: string, message: string): string {
  const digitsOnly = phone.replace(/[^\d]/g, '')
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`
}

export function buildJobDoneMessage(params: {
  customerName: string
  orderNo: string
  technicianName: string
  completedAt: string
}): string {
  const { customerName, orderNo, technicianName, completedAt } = params
  return `Hi ${customerName},\nJob ${orderNo} has been completed by Technician ${technicianName} at ${completedAt}.\nPlease check and leave feedback.\nThank you!`
}

export function buildJobCompletedManagerMessage(params: {
  managerName: string
  orderNo: string
  customerName: string
  technicianName: string
  quotedPrice: number
  finalAmount: number
  photoCount: number
}): string {
  const { managerName, orderNo, customerName, technicianName, quotedPrice, finalAmount, photoCount } =
    params
  const overQuote = finalAmount > quotedPrice * 1.3
  const flags: string[] = []
  if (overQuote) flags.push(`final amount RM ${finalAmount.toFixed(2)} is well above the RM ${quotedPrice.toFixed(2)} quote`)
  if (photoCount === 0) flags.push('no photos were uploaded')
  const flagLine = flags.length > 0 ? `\nFlagged: ${flags.join('; ')}.` : ''
  return `Hi ${managerName},\nJob ${orderNo} for ${customerName} has been completed by ${technicianName}. Final amount: RM ${finalAmount.toFixed(2)}.${flagLine}\nPlease review in the app when you can.`
}

export function buildCustomerContactMessage(params: {
  customerName: string
  orderNo: string
}): string {
  const { customerName, orderNo } = params
  return `Hi ${customerName},\nThis is regarding your order ${orderNo}.\nPlease let us know if you have any questions.\nThank you!`
}

export function buildTechnicianContactMessage(params: {
  technicianName: string
  orderNo: string
  customerName: string
}): string {
  const { technicianName, orderNo, customerName } = params
  return `Hi ${technicianName},\nThis is regarding job ${orderNo} for ${customerName}.\nPlease let us know if you have any questions.\nThank you!`
}

export function buildJobAssignedMessage(params: {
  technicianName: string
  orderNo: string
  customerName: string
  address: string
  serviceType: string
  scheduledAt?: string | null
}): string {
  const { technicianName, orderNo, customerName, address, serviceType, scheduledAt } = params
  const scheduleLine = scheduledAt ? `\nScheduled: ${scheduledAt}` : ''
  return `Hi ${technicianName},\nYou've been assigned a new job: ${orderNo}.\nCustomer: ${customerName}\nAddress: ${address}\nService: ${serviceType}${scheduleLine}\nPlease check the app for full details.`
}
