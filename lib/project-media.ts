const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const PROJECT_MEDIA_MAX_BYTES = 2_000_000;

export function isAllowedProjectMediaType(type: string) {
  return ALLOWED_TYPES.has(type);
}

export function projectPhotoObjectKey(projectId: string, objectId: string) {
  return `projects/${projectId}/${objectId}`;
}

export function milestonePhotoObjectKey(projectId: string, milestoneId: string, objectId: string) {
  return `projects/${projectId}/milestones/${milestoneId}/${objectId}`;
}

export function projectPhotoUrlFor(projectId: string, photoKey?: string | null) {
  if (!projectId || !photoKey) return '';
  return `/api/project-photo?project=${encodeURIComponent(projectId)}&v=${encodeURIComponent(photoKey)}`;
}

export function milestonePhotoUrlFor(
  projectId: string,
  milestoneId: string,
  photoKey?: string | null,
) {
  if (!projectId || !milestoneId || !photoKey) return '';
  return `/api/milestone-photo?project=${encodeURIComponent(projectId)}&milestone=${encodeURIComponent(milestoneId)}&v=${encodeURIComponent(photoKey)}`;
}
