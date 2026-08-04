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
