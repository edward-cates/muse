export type DocumentType = 'canvas' | 'html_artifact'

export interface DocumentMeta {
  id: string
  type: DocumentType
  title: string
  parent_id: string | null
  content_version: number
  created_at: string
  updated_at: string
}
