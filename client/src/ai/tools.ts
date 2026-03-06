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
    description: 'Add a shape to the canvas. Returns the new shape ID.',
    input_schema: {
      type: 'object',
      properties: {
        shape_type: {
          type: 'string',
          enum: ['rectangle', 'ellipse', 'diamond'],
          description: 'The type of shape to create',
        },
        x: { type: 'number', description: 'X position (left edge) in canvas coordinates' },
        y: { type: 'number', description: 'Y position (top edge) in canvas coordinates' },
        width: { type: 'number', description: 'Width in pixels (minimum 20)' },
        height: { type: 'number', description: 'Height in pixels (minimum 20)' },
        text: { type: 'string', description: 'Text label inside the shape' },
        fill: { type: 'string', description: 'Fill color as hex, e.g. #e8edfc' },
        stroke: { type: 'string', description: 'Stroke color as hex, e.g. #4465e9' },
        strokeWidth: { type: 'number', description: 'Stroke width in pixels (default 2.5)' },
      },
      required: ['shape_type', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'add_text',
    description: 'Add a standalone text element to the canvas. Returns the new element ID.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X position' },
        y: { type: 'number', description: 'Y position' },
        text: { type: 'string', description: 'The text content' },
        fontSize: { type: 'number', description: 'Font size in pixels (default 16)' },
      },
      required: ['x', 'y', 'text'],
    },
  },
  {
    name: 'update_element',
    description: 'Update properties of an existing canvas element by ID. Use target_document_id to update elements in a child canvas (e.g. research sub-canvas).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The element ID to update' },
        x: { type: 'number', description: 'New X position' },
        y: { type: 'number', description: 'New Y position' },
        width: { type: 'number', description: 'New width' },
        height: { type: 'number', description: 'New height' },
        text: { type: 'string', description: 'New text label' },
        fill: { type: 'string', description: 'New fill color (hex)' },
        stroke: { type: 'string', description: 'New stroke color (hex)' },
        strokeWidth: { type: 'number', description: 'New stroke width' },
        title: { type: 'string', description: 'New title (for document cards, web cards)' },
        description: { type: 'string', description: 'New description text (for document cards)' },
        target_document_id: { type: 'string', description: 'If provided, update the element in this child canvas instead of the current canvas' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_element',
    description: 'Delete an element from the canvas by ID. Deleting a shape also removes all connectors attached to it.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The element ID to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_line',
    description: 'Add a connector line between two shapes. Routing is automatic. Reference shapes by full ID or short ID (first 8 chars).',
    input_schema: {
      type: 'object',
      properties: {
        start_shape_id: { type: 'string', description: 'ID of the start shape (full UUID or first 8 chars)' },
        end_shape_id: { type: 'string', description: 'ID of the end shape (full UUID or first 8 chars)' },
        lineType: {
          type: 'string',
          enum: ['straight', 'elbow', 'curve'],
          description: 'Line routing style (default: straight)',
        },
        stroke: { type: 'string', description: 'Line color as hex' },
        strokeWidth: { type: 'number', description: 'Line width in pixels' },
      },
      required: ['start_shape_id', 'end_shape_id'],
    },
  },
  {
    name: 'add_arrow',
    description: 'Add an arrow connector. Either or both endpoints can attach to shapes (via ID) or be free-floating (via x,y coordinates). Routing is automatic.',
    input_schema: {
      type: 'object',
      properties: {
        start_shape_id: { type: 'string', description: 'ID of the start shape (full UUID or first 8 chars, omit for free endpoint)' },
        end_shape_id: { type: 'string', description: 'ID of the end shape (full UUID or first 8 chars, omit for free endpoint)' },
        start_x: { type: 'number', description: 'X coordinate for free-floating start point' },
        start_y: { type: 'number', description: 'Y coordinate for free-floating start point' },
        end_x: { type: 'number', description: 'X coordinate for free-floating end point' },
        end_y: { type: 'number', description: 'Y coordinate for free-floating end point' },
        arrowStart: { type: 'boolean', description: 'Show arrowhead at start (default false)' },
        arrowEnd: { type: 'boolean', description: 'Show arrowhead at end (default true)' },
        lineType: {
          type: 'string',
          enum: ['straight', 'elbow', 'curve'],
          description: 'Line routing style (default: straight)',
        },
        stroke: { type: 'string', description: 'Arrow color as hex' },
        strokeWidth: { type: 'number', description: 'Arrow width in pixels' },
      },
      required: [],
    },
  },
  {
    name: 'arrange_grid',
    description: 'Arrange a list of elements into a grid layout. Elements are positioned left-to-right, top-to-bottom.',
    input_schema: {
      type: 'object',
      properties: {
        element_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of elements to arrange',
        },
        columns: { type: 'number', description: 'Number of columns (default: auto based on count)' },
        start_x: { type: 'number', description: 'X origin of the grid (default 100)' },
        start_y: { type: 'number', description: 'Y origin of the grid (default 100)' },
        gap_x: { type: 'number', description: 'Horizontal gap between elements (default 40)' },
        gap_y: { type: 'number', description: 'Vertical gap between elements (default 40)' },
      },
      required: ['element_ids'],
    },
  },
  {
    name: 'set_viewport',
    description: 'Control the user\'s viewport. Viewport auto-fits after each tool call, so this is only needed to focus on a subset of elements.',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['fit_all', 'fit_elements'],
          description: 'fit_all zooms to show all elements; fit_elements focuses on specific elements',
        },
        element_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of elements to focus on (for fit_elements mode)',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'arrange_flow',
    description: 'Arrange elements in a linear flow (horizontal or vertical) with even spacing.',
    input_schema: {
      type: 'object',
      properties: {
        element_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of elements to arrange in order',
        },
        direction: {
          type: 'string',
          enum: ['horizontal', 'vertical'],
          description: 'Flow direction (default: vertical)',
        },
        start_x: { type: 'number', description: 'X origin (default 100)' },
        start_y: { type: 'number', description: 'Y origin (default 100)' },
        gap: { type: 'number', description: 'Gap between elements (default 60)' },
      },
      required: ['element_ids'],
    },
  },
]

export const DOCUMENT_TOOLS: ToolDefinition[] = [
  {
    name: 'add_node',
    description: 'Create a new canvas document and place a card (node) on the current canvas that links to it. The user can double-click the card to navigate into the new canvas. Returns { documentId, cardElementId }.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title for the new canvas (default "Untitled")' },
        x: { type: 'number', description: 'X position for the card on canvas (default 100)' },
        y: { type: 'number', description: 'Y position for the card on canvas (default 100)' },
        width: { type: 'number', description: 'Card width (default 280)' },
        height: { type: 'number', description: 'Card height (default 180)' },
      },
      required: [],
    },
  },
  {
    name: 'create_document',
    description: 'Create an HTML artifact document and place a card on the canvas. The document can be edited by clicking into it. Returns { documentId, cardElementId }.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        html: { type: 'string', description: 'Initial HTML content (self-contained with inline styles/scripts)' },
        x: { type: 'number', description: 'X position for the card on canvas (default 100)' },
        y: { type: 'number', description: 'Y position for the card on canvas (default 100)' },
        width: { type: 'number', description: 'Card width (default 280)' },
        height: { type: 'number', description: 'Card height (default 180)' },
      },
      required: ['title', 'html'],
    },
  },
  {
    name: 'update_document_content',
    description: 'Update the HTML content of an existing document. The document card on the canvas will refresh automatically.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'The document ID to update' },
        html: { type: 'string', description: 'New HTML content (replaces existing)' },
      },
      required: ['document_id', 'html'],
    },
  },
]

export const IMAGE_TOOLS: ToolDefinition[] = [
  {
    name: 'generate_image',
    description: 'Generate an image using DALL-E and place it on the canvas. Returns { id, url, revised_prompt }.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the image to generate' },
        x: { type: 'number', description: 'X position for the image on canvas (default 100)' },
        y: { type: 'number', description: 'Y position for the image on canvas (default 100)' },
        width: { type: 'number', description: 'Display width on canvas (default 512)' },
        height: { type: 'number', description: 'Display height on canvas (default 512)' },
        size: {
          type: 'string',
          enum: ['1024x1024', '1024x1792', '1792x1024'],
          description: 'Generated image dimensions (default 1024x1024)',
        },
      },
      required: ['prompt'],
    },
  },
]

export const RESEARCH_TOOLS: ToolDefinition[] = [
  {
    name: 'add_web_card',
    description: 'Add a web source card to a canvas showing a URL, title, and snippet. Use target_document_id to add the card to a child canvas (e.g. a research sub-canvas) instead of the current one.',
    input_schema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X position' },
        y: { type: 'number', description: 'Y position' },
        width: { type: 'number', description: 'Width (default 280)' },
        height: { type: 'number', description: 'Height (default 160)' },
        url: { type: 'string', description: 'Source URL' },
        title: { type: 'string', description: 'Title/headline' },
        snippet: { type: 'string', description: 'Short summary text' },
        content: { type: 'string', description: 'Full extracted text for context (truncated to 5000 chars)' },
        sourceType: {
          type: 'string',
          enum: ['search', 'url', 'manual'],
          description: 'How this card was created',
        },
        target_document_id: { type: 'string', description: 'If provided, add this card to the specified child canvas instead of the current canvas' },
      },
      required: ['x', 'y', 'url', 'title', 'snippet'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch a web page and extract its text content. Returns { title, text, url }.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch (must be http or https)' },
      },
      required: ['url'],
    },
  },
  // arrange_grid is also useful for research — shared reference
  {
    name: 'arrange_grid',
    description: 'Arrange a list of elements into a grid layout.',
    input_schema: {
      type: 'object',
      properties: {
        element_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of elements to arrange',
        },
        columns: { type: 'number', description: 'Number of columns (default: auto)' },
        start_x: { type: 'number', description: 'X origin (default 100)' },
        start_y: { type: 'number', description: 'Y origin (default 100)' },
        gap_x: { type: 'number', description: 'Horizontal gap (default 40)' },
        gap_y: { type: 'number', description: 'Vertical gap (default 40)' },
      },
      required: ['element_ids'],
    },
  },
  {
    name: 'decompose_text',
    description: 'Decompose a large text into topics with summaries and source line references. Creates a research document card on the canvas containing decomposition cards. Use this when the user pastes a large document or asks you to break down text.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The full text to decompose into topics' },
        title: { type: 'string', description: 'Title for the research document (default: "Untitled Research")' },
        x: { type: 'number', description: 'X position for the first decomposition card (default 100)' },
        y: { type: 'number', description: 'Y position for the first decomposition card (default 100)' },
        target_document_id: { type: 'string', description: 'If provided, place decomposition cards in this child canvas instead of the current canvas' },
      },
      required: ['text'],
    },
  },
]
