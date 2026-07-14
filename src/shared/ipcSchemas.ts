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

export const createInteractionSchema = z
  .object({
    postUrl: z.string().url('URL không hợp lệ'),
    targetObjectId: z.string().min(1),
    pageId: z.number().int().positive(),
    actionType: z.enum(['like', 'love', 'haha', 'wow', 'sad', 'angry', 'comment']),
    commentText: z.string().min(1).max(8000).nullable(),
    scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
    executeNow: z.boolean().optional().default(false)
  })
  .refine(
    (d) => d.actionType !== 'comment' || (d.commentText != null && d.commentText.length > 0),
    { message: 'Nội dung comment không được để trống', path: ['commentText'] }
  )

export type CreateInteractionInput = z.infer<typeof createInteractionSchema>

export const updatePageInfoSchema = z.object({
  pageId: z.number().int().positive(),
  name: z.string().min(1).max(75).optional(),
  about: z.string().max(255).optional(),
  pictureUrl: z.string().url().optional()
})
export type UpdatePageInfoInput = z.infer<typeof updatePageInfoSchema>

export const uploadPagePictureSchema = z.object({
  pageId: z.number().int().positive(),
  imageData: z.instanceof(Uint8Array),
  mimeType: z.string().min(1),
  fileName: z.string().min(1)
})
export type UploadPagePictureInput = z.infer<typeof uploadPagePictureSchema>
