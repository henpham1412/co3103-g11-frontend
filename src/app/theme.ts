import type { ThemeConfig } from 'antd'

// Partial override inherits parent typography, focus tokens and test motion setting.
export const fe2Theme: ThemeConfig = {
  token: { colorPrimaryHover: '#2845A3', colorLinkHover: '#2845A3' },
  components: { Input: { colorBorder: '#667085' } },
}

export const authTheme: ThemeConfig = {
  token: {
    colorPrimary: '#3459C7',
    colorPrimaryHover: '#26449B',
    colorPrimaryBorder: '#3459C7',
    colorLink: '#3459C7',
    colorLinkHover: '#26449B',
    colorInfo: '#3459C7',
    colorInfoBg: '#EDF2FF',
    colorInfoBorder: '#C7D7FE',
    colorError: '#B42318',
    colorSuccess: '#027A48',
    colorBgLayout: '#F6F7FA',
    colorText: '#1C2435',
    colorTextSecondary: '#667085',
    colorTextPlaceholder: '#667085',
    colorBorder: '#E4E8F0',
    fontFamily: "'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    fontFamilyCode: "'IBM Plex Mono', monospace",
    borderRadius: 8,
    controlHeight: 44,
  },
  components: {
    Button: { primaryShadow: 'none', fontWeight: 600 },
    Input: { colorBorder: '#8590A2' },
    Checkbox: { colorBorder: '#8590A2' },
    Form: { labelColor: '#1C2435', itemMarginBottom: 20 },
  },
}
