export type DocumentType = 'canvas' | 'html_artifact' | 'research'

export interface DocumentMeta {
  id: string
  type: DocumentType
  title: string
  content_version: number
  created_at: string
  updated_at: string
}

export interface DecompositionTopic {
  title: string
  summary: string
  color: string
  lineRanges: Array<{ start: number; end: number }>
}

export interface ResearchMetadata {
  topics: DecompositionTopic[]
}
