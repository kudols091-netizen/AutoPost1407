import FormData from 'form-data'
import { graphGet, graphPost, graphPostMultipart } from './client'

export interface FbPageDetails {
  id: string
  name: string
  about?: string
  picture: { data: { url: string } }
}

export async function fetchPageDetails(pageFbId: string, token: string): Promise<FbPageDetails> {
  return graphGet<FbPageDetails>(`/${pageFbId}`, {
    access_token: token,
    fields: 'id,name,about,picture{url}'
  })
}

export async function updatePageInfo(
  pageFbId: string,
  token: string,
  patch: { name?: string; about?: string }
): Promise<void> {
  await graphPost<{ success: boolean }>(`/${pageFbId}`, { ...patch, access_token: token })
}

export async function updatePagePicture(
  pageFbId: string,
  token: string,
  pictureUrl: string
): Promise<void> {
  await graphPost<{ success: boolean }>(`/${pageFbId}/picture`, {
    url: pictureUrl,
    access_token: token
  })
}

export async function uploadPagePicture(
  pageFbId: string,
  token: string,
  imageBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<void> {
  const form = new FormData()
  form.append('source', imageBuffer, { filename: fileName, contentType: mimeType })
  form.append('access_token', token)
  await graphPostMultipart<{ success: boolean }>(`/${pageFbId}/picture`, form)
}
