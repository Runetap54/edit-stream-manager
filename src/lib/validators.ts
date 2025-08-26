import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(1, 'Project name is required')
  .max(50, 'Project name must be less than 50 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Project name must contain only letters, numbers, hyphens, and underscores');

export const storageKeySchema = (ownerId: string, project: string) =>
  z
    .string()
    .min(1, 'File key is required')
    .refine(
      (key) => key.startsWith(`${ownerId}/projects/${project}/photos/`),
      `File must belong to your project (${project})`
    );

export const sceneCreateSchema = z.object({
  folder: slugSchema,
  startKey: z.string().min(1, 'Start image is required'),
  endKey: z.string().optional(),
  shotType: z.number().int().min(1).max(6, 'Shot type must be between 1 and 6'),
});

export const sceneCompleteSchema = z.object({
  version: z.number().int().positive('Version must be a positive integer'),
  videoKey: z.string().optional(),
  videoUrl: z.string().url().optional(),
  renderMeta: z.record(z.any()).optional(),
}).refine(
  (data) => data.videoKey || data.videoUrl,
  'Either videoKey or videoUrl must be provided'
);

export const projectCreateSchema = z.object({
  name: slugSchema,
});