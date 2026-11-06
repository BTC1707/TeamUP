import { webcrypto } from 'node:crypto';

const pair = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);
const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
const decode = (value) => Buffer.from(value, 'base64url');
const publicBytes = Buffer.concat([Buffer.from([4]), decode(jwk.x), decode(jwk.y)]);

console.log('VAPID_SERVER_PUBLIC_KEY=' + publicBytes.toString('base64url'));
console.log('VAPID_SERVER_PRIVATE_KEY=' + jwk.d);
console.log('VAPID_SUBJECT=https://teamup.landonpack7-teamup.workers.dev');
console.log('\nKeep the private key secret. Use the public key as a Worker variable and the private key as a Worker secret.');
