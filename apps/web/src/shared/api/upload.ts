import { api } from '@/shared/api/client'
import type { ApiResponse } from '@/shared/types/api'

export type UploadObject = {
  key: string
  url: string
  filename: string
  content_type: string
  size: number
}

export async function uploadImage(file: File, folder = 'foto-sebelum'): Promise<UploadObject> {
  const form = new FormData()
  form.append('file', file)
  form.append('folder', folder)

  // The shared client defaults to application/json, which makes axios serialize FormData to
  // JSON; send it as multipart (axios adds the boundary) so the API receives the file.
  const { data } = await api.post<ApiResponse<UploadObject>>('/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })

  if (!data.success || !data.data) {
    throw new Error(data.message || 'Upload gagal')
  }
  return data.data
}
