export function photosProjectPrefix(uid: string, project: string) {
  const root = process.env.STORAGE_PHOTOS_ROOT || 'Photos';
  return `${root}/${project}/`;
}

export function scenesProjectPrefix(uid: string, project: string) {
  const root = process.env.STORAGE_SCENES_ROOT || 'Scenes';
  return `users/${uid}/${root}/${project}/`;
}

export function photosRootForUser(uid: string) {
  const root = process.env.STORAGE_PHOTOS_ROOT || 'Photos';
  return `${root}/`;
}