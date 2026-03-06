export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required: string[]
  }
}

export const CANVAS_TOOLS: ToolDefinition[] = [
  {
    name: 'add_shape',
    description: 'Add a shape to the canvas. Returns the new shape ID. Use target_document_id to add to a child canvas.',
    input_schema: {
      type: 'object',
      properties: {
        shape_type: { type: 'string', enum: ['rectangle', 'ellipse', 'diamond'], description: 'The type of shape' },
        x: { type: 'number', description: 'X position' },
        y: { type: 'number', description: 'Y position' },
        width: { type: 'number', description: 'Width in pixels (minimum 20)' },
        height: { type: 'number', description: 'Height in pixels (minimum 20)' },
        text: { type: 'string', description: 'Text label inside the shape' },
        fill: { type: 'string', description: 'Fill color as hex' },
        stroke: { type: 'string', description: 'Stroke color as hex' },
        strokeWidth: { type: 'number', description: 'Stroke width in pixels' },
        target_document_id: { type: 'string', description: 'Add shape to this child canvas instead of the current one' },
      },
      required: ['shape_type', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'add_arrow',
    description: 'Add an arrow connector. Either or both endpoints can attach to shapes (via ID) or be free-floating (via x,y). Use target_document_id for child canvas.',
    input_schema: {
      type: 'object',
      properties: {
        start_shape_id: { type: 'string', description: 'ID of the start shape (omit for free endpoint)' },
        end_shape_id: { type: 'string', description: 'ID of the end shape (omit for free endpoint)' },
        start_x: { type: 'number', description: 'X for free-floating start' },
        start_y: { type: 'number', description: 'Y for free-floating start' },
        end_x: { type: 'number', description: 'X for free-floating end' },
        end_y: { type: 'number', description: 'Y for free-floating end' },
        arrowStart: { type: 'boolean', description: 'Show arrowhead at start (default false)' },
        arrowEnd: { type: 'boolean', description: 'Show arrowhead at end (default true)' },
        lineType: { type: 'string', enum: ['straight', 'elbow', 'curve'], description: 'Line routing style' },
        stroke: { type: 'string', description: 'Arrow color as hex' },
        strokeWidth: { type: 'number', description: 'Arrow width in pixels' },
        target_document_id: { type: 'string', description: 'Add arrow to this child canvas instead of the current one' },
      },
      required: [],
    },
  },
  {
    name: 'update_element',
    description: 'Update properties of an existing canvas element by ID. Use target_document_id for child canvas.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The element ID to update' },
        x: { type: 'number' }, y: { type: 'number' },
        width: { type: 'number' }, height: { type: 'number' },
        text: { type: 'string' }, fill: { type: 'string' }, stroke: { type: 'string' },
        strokeWidth: { type: 'number' },
        title: { type: 'string' }, description: { type: 'string' },
        target_document_id: { type: 'string', description: 'Update element in this child canvas' },
      },
      required: ['id'],
    },
  },
  {
    name: 'arrange_grid',
    description: 'Arrange elements into a grid layout.',
    input_schema: {
      type: 'object',
      properties: {
        element_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of elements to arrange' },
        columns: { type: 'number' },
        start_x: { type: 'number' }, start_y: { type: 'number' },
        gap_x: { type: 'number' }, gap_y: { type: 'number' },
      },
      required: ['element_ids'],
    },
  },
]

export const DOCUMENT_TOOLS: ToolDefinition[] = [
  {
    name: 'add_node',
    description: 'Create a new canvas document and place a card on the current canvas. Returns { documentId, cardElementId }.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title for the new canvas' },
        x: { type: 'number' }, y: { type: 'number' },
        width: { type: 'number' }, height: { type: 'number' },
      },
      required: [],
    },
  },
]

export const RESEARCH_TOOLS: ToolDefinition[] = [
  {
    name: 'add_web_card',
    description: 'Add a web source card. Use target_document_id for child canvas.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number' }, y: { type: 'number' },
        width: { type: 'number' }, height: { type: 'number' },
        url: { type: 'string', description: 'Source URL' },
        title: { type: 'string', description: 'Title/headline' },
        snippet: { type: 'string', description: 'Short summary' },
        content: { type: 'string', description: 'Full extracted text' },
        sourceType: { type: 'string', enum: ['search', 'url', 'manual'] },
        target_document_id: { type: 'string', description: 'Add to child canvas' },
      },
      required: ['x', 'y', 'url', 'title', 'snippet'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch a web page and extract text. Returns { title, text, url }.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch (http/https)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'decompose_text',
    description: 'Decompose text into topics with summaries and line references. Use target_document_id to place the result card in a child canvas.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to decompose' },
        title: { type: 'string', description: 'Title for the research document' },
        x: { type: 'number' }, y: { type: 'number' },
        target_document_id: { type: 'string', description: 'Place result in child canvas' },
      },
      required: ['text'],
    },
  },
]
