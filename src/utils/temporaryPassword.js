/** Generate a one-time login password (avoid ambiguous chars). */
export function generateTemporaryPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let pw = '';
  for (let i = 0; i < length; i += 1) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}
