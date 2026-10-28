import { hashPassword } from '../lib/auth-hash.mjs';
const pw = process.argv[2];
if (!pw || pw.length < 10) { console.error('Usage: npm run hash -- "your password"   (at least 10 characters)'); process.exit(1); }
console.log(hashPassword(pw));
