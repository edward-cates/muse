import html2canvas from 'html2canvas'

const MAX_DIM = 2000
const SCALE = 0.5

export async function captureCanvas(element: HTMLElement): Promise<string> {
  const canvas = await html2canvas(element, {
    scale: SCALE,
    useCORS: true,
    logging: false,
    width: Math.min(element.scrollWidth, MAX_DIM),
    height: Math.min(element.scrollHeight, MAX_DIM),
    windowWidth: Math.min(element.scrollWidth, MAX_DIM),
    windowHeight: Math.min(element.scrollHeight, MAX_DIM),
  })
  return canvas.toDataURL('image/png').replace('data:image/png;base64,', '')
}
