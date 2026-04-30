import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))
