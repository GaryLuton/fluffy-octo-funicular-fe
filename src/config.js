require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || 'noreply@stuflover.com',
  allowedOrigins,
  isProd,
};
