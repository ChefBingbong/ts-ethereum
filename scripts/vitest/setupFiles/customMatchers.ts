import { expect } from 'vitest'

expect.extend({
  toBeWithMessage(received: unknown, expected: unknown, message: string) {
    if (Object.is(received, expected)) {
      return {
        message: () => 'Received value is the same as expected value',
        pass: true,
      }
    }

    return {
      pass: false,
      message: () => message,
      actual: received,
      expected,
    }
  },
  toSatisfy(received: unknown, func: (received: unknown) => boolean) {
    if (func(received)) {
      return {
        message: () => 'Received value satisfied the condition',
        pass: true,
      }
    }

    return {
      pass: false,
      message: () => 'Received value did not satisfy the condition',
    }
  },
  toEqualWithMessage(received: unknown, expected: unknown, message: string) {
    if (this.equals(received, expected)) {
      return {
        message: () => 'Received value equals expected value',
        pass: true,
      }
    }

    return {
      pass: false,
      message: () => message,
      actual: received,
      expected,
    }
  },
})
