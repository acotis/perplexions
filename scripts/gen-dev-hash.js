import { pbkdf2, randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/gen-dev-hash.js <password>');
  process.exit(1);
}

const salt = randomBytes(16);
pbkdf2(password, salt, 100_000, 32, 'sha256', (err, key) => {
  if (err) throw err;
  console.log(`DEV_SALT = '${salt.toString('hex')}'`);
  console.log(`DEV_HASH = '${key.toString('hex')}'`);
});
