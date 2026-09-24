export const PHOTO_BUCKET = 'training-photos';
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_BATCH = 10;
export type TrainingPhoto = { id: string; team_id: string; training_id: string; uploaded_by: string; path: string; filename: string; created_at: string };
export function photoExtension(file: Pick<File, 'type' | 'size'>): string {
 const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string,string>)[file.type];
 if (!extension) throw new Error('Elige fotos JPG, PNG o WebP. Convierte las fotos HEIC a JPG antes de subirlas.');
 if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('Cada foto debe pesar entre 1 byte y 10 MB.');
 return extension;
}
export function downloadPhoto(blob: Blob, filename: string) {
 const url = URL.createObjectURL(blob), link = document.createElement('a');
 link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
 window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
