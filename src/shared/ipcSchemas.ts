import { z } from 'zod'

export const createPostSchema = z
  .object({
    message: z.string().trim().min(1, 'Message cannot be empty').max(63000),
    linkUrl: z.string().url().nullable(),
    postType: z.enum(['text', 'photo', 'link']),
    pageIds: z.array(z.number().int().positive()).min(1, 'Select at least one Page'),
    scheduledPublishTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
    publishNow: z.boolean().optional().default(false),
    media: z
      .object({
        localFilePath: z.string().min(1),
        mimeType: z.string().min(1)
      })
      .nullable()
      .optional()
  })
  .refine((data) => data.postType !== 'photo' || !!data.media, {
    message: 'A photo is required for photo posts',
    path: ['media']
  })

export type CreatePostInput = z.infer<typeof createPostSchema>

export const importMediaSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  data: z.instanceof(Uint8Array)
})

export type ImportMediaInput = z.infer<typeof importMediaSchema>
