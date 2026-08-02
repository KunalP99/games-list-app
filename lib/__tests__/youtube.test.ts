import { describe, it, expect } from 'vitest'
import { parseYouTubeUrl, youtubeEmbedUrl, youtubeThumbnail, youtubeCanonicalUrl, mapGameVideos } from '../youtube'

describe('parseYouTubeUrl', () => {
  it('parses a standard watch URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses a youtu.be short link', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses a Shorts URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses an embed URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses a m.youtube.com URL', () => {
    expect(parseYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses a music.youtube.com URL', () => {
    expect(parseYouTubeUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses a /live/ URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/live/dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses an old /v/ embed URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/v/dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('ignores extra query params (share codes, channel, index)', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?si=AbCdEf12'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&ab_channel=Test'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('parses a dedicated playlist page', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLabc123def456'))
      .toEqual({ kind: 'playlist', id: 'PLabc123def456' })
  })

  it('treats a watch URL with both v= and list= as a single video', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123def456'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' })
  })

  it('falls back to playlist when a list= is present but no video id', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?list=PLabc123def456'))
      .toEqual({ kind: 'playlist', id: 'PLabc123def456' })
  })

  it('rejects non-YouTube hosts', () => {
    expect(parseYouTubeUrl('https://vimeo.com/12345')).toBeNull()
    expect(parseYouTubeUrl('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseYouTubeUrl('')).toBeNull()
    expect(parseYouTubeUrl('just some text')).toBeNull()
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=tooshort')).toBeNull()
  })
})

describe('youtubeEmbedUrl', () => {
  it('builds a video embed URL with autoplay', () => {
    expect(youtubeEmbedUrl('video', 'dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1')
  })

  it('builds a playlist embed URL with autoplay', () => {
    expect(youtubeEmbedUrl('playlist', 'PLabc123def456'))
      .toBe('https://www.youtube.com/embed/videoseries?list=PLabc123def456&autoplay=1')
  })

  it('omits autoplay when disabled', () => {
    expect(youtubeEmbedUrl('video', 'dQw4w9WgXcQ', false))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(youtubeEmbedUrl('playlist', 'PLabc123def456', false))
      .toBe('https://www.youtube.com/embed/videoseries?list=PLabc123def456')
  })
})

describe('youtubeThumbnail', () => {
  it('returns a direct thumbnail for videos', () => {
    expect(youtubeThumbnail('video', 'dQw4w9WgXcQ'))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  it('returns null for playlists (no direct thumbnail)', () => {
    expect(youtubeThumbnail('playlist', 'PLabc123def456')).toBeNull()
  })
})

describe('youtubeCanonicalUrl', () => {
  it('builds canonical watch and playlist URLs', () => {
    expect(youtubeCanonicalUrl('video', 'dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(youtubeCanonicalUrl('playlist', 'PLabc123def456')).toBe('https://www.youtube.com/playlist?list=PLabc123def456')
  })
})

describe('mapGameVideos', () => {
  it('adapts stored game videos to the card shape (id from youtube_id, kind video)', () => {
    expect(mapGameVideos([
      { youtube_id: 'abc12345678', title: 'Clip', author_name: 'Chan', thumbnail_url: 'http://t/1.jpg' },
    ])).toEqual([
      { id: 'abc12345678', kind: 'video', youtube_id: 'abc12345678', title: 'Clip', author_name: 'Chan', thumbnail_url: 'http://t/1.jpg' },
    ])
  })

  it('returns an empty array for no videos', () => {
    expect(mapGameVideos([])).toEqual([])
  })
})
