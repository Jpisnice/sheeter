import { Email } from '@convex-dev/auth/providers/Email'
import { Resend } from 'resend'

function generateOTP(length: number = 6): string {
  const digits = '0123456789'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += digits[bytes[i] % 10]
  }
  return out
}

export const ResendOTP = Email({
  id: 'resend-otp',
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 15,
  async generateVerificationToken() {
    return generateOTP(6)
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const apiKey = provider.apiKey ?? process.env.AUTH_RESEND_KEY
    if (!apiKey) {
      throw new Error('AUTH_RESEND_KEY env var is not set')
    }
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? 'Sheeter <onboarding@resend.dev>',
      to: [email],
      subject: `Your Sheeter sign-in code: ${token}`,
      text: `Your one-time code is: ${token}\n\nIt expires in 15 minutes.`,
    })
    if (error) {
      throw new Error(JSON.stringify(error))
    }
  },
})
