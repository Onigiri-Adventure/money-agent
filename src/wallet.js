import { privateKeyToAccount } from 'viem/accounts';

export function evmAccount(env) {
  const key = env.EVM_PRIVATE_KEY;
  if (!key) throw new Error('EVM_PRIVATE_KEY secret not configured');
  const normalized = key.startsWith('0x') ? key : `0x${key}`;
  return privateKeyToAccount(normalized);
}

export async function signEip191(env, message) {
  const account = evmAccount(env);
  const signature = await account.signMessage({ message });
  return { address: account.address, signature };
}
