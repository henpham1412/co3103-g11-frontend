import { theme } from 'antd'
import { describe, expect, it } from 'vitest'
import { authTheme, fe2Theme } from './theme'

function luminance(color: string) {
  const components = color.startsWith('#')
    ? color.slice(1).match(/.{2}/g)!.map(part => parseInt(part, 16))
    : color.match(/[\d.]+/g)!.map(Number)
  const [r, g, b, alpha = 1] = components
  const linear = [r, g, b].map(value => {
    const channel = (value * alpha + 255 * (1 - alpha)) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

describe('auth theme contrast', () => {
  it('scopes FE-2 design overrides while preserving inherited motion and FE-1 borders', () => {
    expect(fe2Theme.token?.colorPrimaryHover).toBe('#2845A3')
    expect(fe2Theme.components?.Input?.colorBorder).toBe('#D0D5DD')
    expect(fe2Theme.token).not.toHaveProperty('motion')
    expect(authTheme.components?.Input?.colorBorder).toBe('#8590A2')
  })
  const tokens = theme.getDesignToken(authTheme)

  it("all six text tokens meet WCAG AA on the form surface", () => {
    for (const token of ['colorText', 'colorTextSecondary', 'colorTextPlaceholder', 'colorError', 'colorSuccess', 'colorLink'] as const) {
      const values = [luminance(tokens[token]), luminance(tokens.colorBgContainer)].sort((a, b) => a - b)
      expect((values[1] + 0.05) / (values[0] + 0.05), `case: ${JSON.stringify(token)}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps keyboard focus indicators distinguishable from the form surface', () => {
    const values = [luminance(tokens.colorPrimaryBorder), luminance(tokens.colorBgContainer)].sort((a, b) => a - b)
    expect((values[1] + 0.05) / (values[0] + 0.05)).toBeGreaterThanOrEqual(3)
  })
})
