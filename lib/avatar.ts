const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const AVATAR_MAX_BYTES = 2_000_000;

export function avatarUrlFor(userId: string, avatarKey?: string | null) {
  if (!userId || !avatarKey) return '';
  return `/api/avatar?user=${encodeURIComponent(userId)}&v=${encodeURIComponent(avatarKey)}`;
}

export function isAllowedAvatarType(type: string) {
  return ALLOWED_TYPES.has(type);
}

export function avatarObjectKey(userId: string, objectId: string) {
  return `avatars/${userId}/${objectId}`;
}
