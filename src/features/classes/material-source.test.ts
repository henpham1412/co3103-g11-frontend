import { describe, expect, it } from 'vitest'

import { isAllowedVideoUrl, isHttpsUrl, isStoredMaterialFile } from './material-source'

describe('stored material files', () => {
  it('recognises the key the upload endpoint mints', () => {
    expect(isStoredMaterialFile('/api/v1/materials/files/abc-123.pdf')).toBe(true)
    expect(isStoredMaterialFile('/materials/files/abc-123.mp4')).toBe(true)
    expect(isStoredMaterialFile('  /api/v1/materials/files/abc-123.pdf  ')).toBe(true)
  })

  it('treats every other address as external', () => {
    expect(isStoredMaterialFile('https://youtube.com/watch?v=abc')).toBe(false)
    // An absolute address that merely looks like the asset path is still not a stored key:
    // the server only ever writes the relative prefix.
    expect(isStoredMaterialFile('https://cdn.example.org/api/v1/materials/files/abc.pdf')).toBe(false)
    expect(isStoredMaterialFile('/api/v1/materials/files/')).toBe(false)
    expect(isStoredMaterialFile('/api/v1/materials/files/nested/abc.pdf')).toBe(false)
    expect(isStoredMaterialFile(null)).toBe(false)
    expect(isStoredMaterialFile(undefined)).toBe(false)
    expect(isStoredMaterialFile('   ')).toBe(false)
  })
})

describe('HTTPS links', () => {
  it('requires an absolute HTTPS address, as URI.create does on the server', () => {
    expect(isHttpsUrl('https://example.org/resource')).toBe(true)
    expect(isHttpsUrl('http://example.org/resource')).toBe(false)
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpsUrl('/materials/files/abc.pdf')).toBe(false)
    expect(isHttpsUrl('not a url')).toBe(false)
    expect(isHttpsUrl(null)).toBe(false)
  })
})

describe('video links', () => {
  it('accepts the trusted player hosts and their subdomains', () => {
    expect(isAllowedVideoUrl('https://youtube.com/watch?v=abc')).toBe(true)
    expect(isAllowedVideoUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
    expect(isAllowedVideoUrl('https://youtube-nocookie.com/embed/abc')).toBe(true)
    expect(isAllowedVideoUrl('https://player.vimeo.com/video/123')).toBe(true)
    expect(isAllowedVideoUrl('https://VIMEO.com/123')).toBe(true)
  })

  it('accepts a direct stream file over HTTPS', () => {
    expect(isAllowedVideoUrl('https://cdn.example.org/clip.mp4')).toBe(true)
    expect(isAllowedVideoUrl('https://cdn.example.org/clip.WEBM')).toBe(true)
    // The extension is read from the path, so a query string does not hide it.
    expect(isAllowedVideoUrl('https://example.org/clip.mp4?download=1')).toBe(true)
  })

  it('rejects lookalike hosts, other schemes and non-stream addresses', () => {
    expect(isAllowedVideoUrl('https://notyoutube.com/watch?v=abc')).toBe(false)
    expect(isAllowedVideoUrl('https://youtube.com.example.org/watch?v=abc')).toBe(false)
    expect(isAllowedVideoUrl('https://example.org/watch?v=clip.mp4')).toBe(false)
    expect(isAllowedVideoUrl('https://example.org/clip.avi')).toBe(false)
    expect(isAllowedVideoUrl('http://youtube.com/watch?v=abc')).toBe(false)
    expect(isAllowedVideoUrl('/api/v1/materials/files/abc.mp4')).toBe(false)
    expect(isAllowedVideoUrl(null)).toBe(false)
  })
})