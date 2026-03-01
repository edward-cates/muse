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
    description: 'Update properties of an existing canvas element by ID.',
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
    description: 'Add a connector line between two shapes. Routing is automatic — just specify the two shape IDs.',
    input_schema: {
      type: 'object',
      properties: {
        start_shape_id: { type: 'string', description: 'ID of the shape where the line starts' },
        end_shape_id: { type: 'string', description: 'ID of the shape where the line ends' },
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
    description: 'Add an arrow connector. Either or both endpoints can attach to shapes (via shape ID) or be free-floating (via x,y coordinates). Routing is automatic.',
    input_schema: {
      type: 'object',
      properties: {
        start_shape_id: { type: 'string', description: 'ID of the shape where the arrow starts (empty string or omit for free endpoint)' },
        end_shape_id: { type: 'string', description: 'ID of the shape where the arrow ends (empty string or omit for free endpoint)' },
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

export const RESEARCH_TOOLS: ToolDefinition[] = [
  {
    name: 'add_web_card',
    description: 'Add a web source card to the canvas showing a URL, title, and snippet.',
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
]
