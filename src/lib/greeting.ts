export function getGreeting(): { text: string; emoji: string; message: string } {
  const hour = new Date().getHours()
  if (hour < 12) return { text: 'Good morning', emoji: '☀️', message: "Let's have a productive day!" }
  if (hour < 17) return { text: 'Good afternoon', emoji: '🌤', message: 'Hope your day is going well.' }
  return { text: 'Good evening', emoji: '🌙', message: 'Almost time to wrap up.' }
}
