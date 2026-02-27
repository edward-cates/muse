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
        width: { type: 'number', description: 'Width in pixels (minimum 40)' },
        height: { type: 'number', description: 'Height in pixels (minimum 30)' },
        text: { type: 'string', description: 'Text label inside the shape' },
        stroke: { type: 'string', description: 'Stroke color as hex, e.g. #4f46e5' },
      },
      required: ['shape_type', 'x', 'y', 'width', 'height'],
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
        stroke: { type: 'string', description: 'New stroke color' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_element',
    description: 'Delete an element from the canvas by ID.',
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
    description: 'Add a connector line between two shapes. The line attaches to anchor points on each shape.',
    input_schema: {
      type: 'object',
      properties: {
        start_shape_id: { type: 'string', description: 'ID of the shape where the line starts' },
        end_shape_id: { type: 'string', description: 'ID of the shape where the line ends' },
        start_anchor: {
          type: 'string',
          enum: ['top', 'right', 'bottom', 'left'],
          description: 'Anchor point on the start shape',
        },
        end_anchor: {
          type: 'string',
          enum: ['top', 'right', 'bottom', 'left'],
          description: 'Anchor point on the end shape',
        },
      },
      required: ['start_shape_id', 'end_shape_id', 'start_anchor', 'end_anchor'],
    },
  },
]
