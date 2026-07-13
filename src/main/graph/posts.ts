import { createReadStream } from 'fs'
import FormData from 'form-data'
import { graphDelete, graphGet, graphPost, graphPostMultipart } from './client'

interface GraphIdResponse {
  id: string
  post_id?: string
}

export interface FeedPostParams {
  pageAccessToken: string
  fbPageId: string
  message: string
  linkUrl: string | null
  /** null publishes immediately instead of scheduling. */
  scheduledPublishTimeUnix: number | null
}

export interface PhotoPostParams {
  pageAccessToken: string
  fbPageId: string
  message: string
  localFilePath: string
  /** null publishes immediately instead of scheduling. */
  scheduledPublishTimeUnix: number | null
}

/** Meta rejects scheduled_publish_time outside this window (10 min to 30 days out). */
export function isTooSoonToSchedule(scheduledPublishTimeUnix: number): boolean {
  return scheduledPublishTimeUnix < Math.floor(Date.now() / 1000) + 10 * 60
}

export function isTooFarToSchedule(scheduledPublishTimeUnix: number): boolean {
  return scheduledPublishTimeUnix > Math.floor(Date.now() / 1000) + 30 * 86400
}

export async function createFeedPost(params: FeedPostParams): Promise<string> {
  const res = await graphPost<GraphIdResponse>(`/${params.fbPageId}/feed`, {
    message: params.message,
    link: params.linkUrl ?? undefined,
    access_token: params.pageAccessToken,
    ...(params.scheduledPublishTimeUnix === null
      ? { published: true }
      : { published: false, scheduled_publish_time: params.scheduledPublishTimeUnix })
  })
  return res.id
}

export async function createPhotoPost(params: PhotoPostParams): Promise<string> {
  if (params.scheduledPublishTimeUnix === null) {
    const form = new FormData()
    form.append('message', params.message)
    form.append('access_token', params.pageAccessToken)
    form.append('source', createReadStream(params.localFilePath))
    form.append('published', 'true')

    const res = await graphPostMultipart<GraphIdResponse>(`/${params.fbPageId}/photos`, form)
    return res.post_id ?? res.id
  }

  // Uploading directly to /photos with published=false + scheduled_publish_time only creates
  // an unpublished Photo, not a Post — there's no post_id to reconcile against later. Meta's
  // documented path for scheduling a photo post is to upload the photo unpublished (no schedule
  // time), then create the actual scheduled Post on /feed referencing it via attached_media.
  const uploadForm = new FormData()
  uploadForm.append('access_token', params.pageAccessToken)
  uploadForm.append('source', createReadStream(params.localFilePath))
  uploadForm.append('published', 'false')
  const uploaded = await graphPostMultipart<GraphIdResponse>(`/${params.fbPageId}/photos`, uploadForm)

  const res = await graphPost<GraphIdResponse>(`/${params.fbPageId}/feed`, {
    message: params.message,
    access_token: params.pageAccessToken,
    attached_media: JSON.stringify([{ media_fbid: uploaded.id }]),
    published: false,
    scheduled_publish_time: params.scheduledPublishTimeUnix
  })
  return res.id
}

/** Deletes a live or still-scheduled post from the Page. */
export async function deleteFbPost(fbPostId: string, pageAccessToken: string): Promise<void> {
  await graphDelete(`/${fbPostId}`, { access_token: pageAccessToken })
}

export async function getPostPublishStatus(
  fbPostId: string,
  pageAccessToken: string
): Promise<{ isPublished: boolean }> {
  const res = await graphGet<{ is_published?: boolean }>(`/${fbPostId}`, {
    fields: 'is_published',
    access_token: pageAccessToken
  })
  return { isPublished: Boolean(res.is_published) }
}
