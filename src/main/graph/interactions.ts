import { graphPost } from './client'

const REACTION_TYPE_MAP: Record<string, string> = {
  like: 'LIKE',
  love: 'LOVE',
  haha: 'HAHA',
  wow: 'WOW',
  sad: 'SAD',
  angry: 'ANGRY'
}

export async function reactToPost(
  objectId: string,
  userToken: string,
  reactionType: string,
  pageFbId: string
): Promise<void> {
  const type = REACTION_TYPE_MAP[reactionType] ?? 'LIKE'
  await graphPost<{ success: boolean }>(`/${objectId}/reactions`, {
    type,
    access_token: userToken,
    page_id: pageFbId
  })
}

export async function commentOnPost(objectId: string, token: string, message: string): Promise<{ id: string }> {
  return graphPost<{ id: string }>(`/${objectId}/comments`, { message, access_token: token })
}
