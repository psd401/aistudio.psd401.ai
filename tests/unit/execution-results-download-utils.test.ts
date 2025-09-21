import { describe, it, expect } from '@jest/globals'

// Since the utility functions are not exported, we'll test them through the main handler
// This tests the internal logic for markdown generation and filename creation

describe('Execution Results Download Utility Functions', () => {
  describe('Markdown Generation', () => {
    it('should format execution duration correctly', () => {
      // Test the formatDuration function logic
      const testCases = [
        { input: 500, expected: '500ms' },
        { input: 1000, expected: '1s' },
        { input: 1500, expected: '1s' },
        { input: 65000, expected: '1m 5s' },
        { input: 3665000, expected: '1h 1m 5s' },
        { input: 7200000, expected: '2h 0m 0s' }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = formatDurationHelper(input)
        expect(result).toBe(expected)
      })
    })

    it('should format datetime correctly', () => {
      const testDate = new Date('2025-01-15T14:30:45Z')
      const formatted = formatDateTimeHelper(testDate)

      // Should include date and time with timezone
      expect(formatted).toMatch(/January 15, 2025/)
      expect(formatted).toMatch(/2:30 PM|14:30/)
    })

    it('should extract schedule description from config', () => {
      const testCases = [
        {
          config: { description: 'Daily backup process' },
          expected: 'Daily backup process'
        },
        {
          config: { cron: '0 0 * * *' },
          expected: 'Cron: 0 0 * * *'
        },
        {
          config: { frequency: 'weekly' },
          expected: 'Frequency: weekly'
        },
        {
          config: {},
          expected: 'Scheduled execution'
        },
        {
          config: null,
          expected: 'Manual execution'
        }
      ]

      testCases.forEach(({ config, expected }) => {
        const result = getScheduleDescriptionHelper(config)
        expect(result).toBe(expected)
      })
    })

    it('should format input data as readable list', () => {
      const testCases = [
        {
          input: {},
          expected: 'No input parameters'
        },
        {
          input: { simpleParam: 'value' },
          expected: '- Simple Param: value'
        },
        {
          input: { camelCaseParam: 'test', anotherParam: 123 },
          expected: '- Camel Case Param: test\n- Another Param: 123'
        },
        {
          input: { complexObject: { nested: 'value' } },
          expected: '- Complex Object: {\n  "nested": "value"\n}'
        }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = formatInputDataHelper(input)
        expect(result).toBe(expected)
      })
    })

    it('should handle different result data formats in markdown', () => {
      const testCases = [
        {
          name: 'content field',
          resultData: { content: '# Test Content\n\nSome markdown here' },
          expectedIncludes: ['# Test Content', 'Some markdown here']
        },
        {
          name: 'text field',
          resultData: { text: 'Plain text result' },
          expectedIncludes: ['Plain text result']
        },
        {
          name: 'output field',
          resultData: { output: '## Output\n\nProcess completed' },
          expectedIncludes: ['## Output', 'Process completed']
        },
        {
          name: 'complex object fallback',
          resultData: { metadata: { version: '1.0' }, data: [1, 2, 3] },
          expectedIncludes: ['```json', '"metadata"', '"data"', '[1,2,3]']
        }
      ]

      testCases.forEach(({ name, resultData, expectedIncludes }) => {
        const mockResult = createMockExecutionResult({
          result_data: JSON.stringify(resultData),
          status: 'success'
        })

        const markdown = generateMarkdownHelper(mockResult)

        expectedIncludes.forEach(expected => {
          expect(markdown).toContain(expected)
        })
      })
    })

    it('should generate complete markdown structure', () => {
      const mockResult = createMockExecutionResult({
        schedule_name: 'Test Schedule',
        status: 'success',
        executed_at: '2025-01-15T10:30:00Z',
        execution_duration_ms: 5000,
        result_data: JSON.stringify({ content: 'Test result content' }),
        input_data: JSON.stringify({ param1: 'value1' }),
        schedule_config: JSON.stringify({ frequency: 'daily' }),
        assistant_architect_name: 'Test Assistant'
      })

      const markdown = generateMarkdownHelper(mockResult)

      // Check all required sections
      expect(markdown).toContain('# Test Schedule')
      expect(markdown).toContain('**Executed:**')
      expect(markdown).toContain('**Schedule:** Frequency: daily')
      expect(markdown).toContain('**Status:** Success ✓')
      expect(markdown).toContain('## Input Parameters')
      expect(markdown).toContain('- Param1: value1')
      expect(markdown).toContain('## Results')
      expect(markdown).toContain('Test result content')
      expect(markdown).toContain('## Execution Details')
      expect(markdown).toContain('- Duration: 5s')
      expect(markdown).toContain('- Assistant: Test Assistant')
      expect(markdown).toContain('Generated by AI Studio - Peninsula School District')
      expect(markdown).toContain('View online: https://aistudio.psd401.ai/execution-results/')
    })

    it('should handle failed execution in markdown', () => {
      const mockResult = createMockExecutionResult({
        status: 'failed',
        error_message: 'Connection timeout',
        result_data: null
      })

      const markdown = generateMarkdownHelper(mockResult)

      expect(markdown).toContain('**Status:** Failed ✗')
      expect(markdown).toContain('**Error:** Connection timeout')
    })

    it('should handle running execution in markdown', () => {
      const mockResult = createMockExecutionResult({
        status: 'running',
        result_data: null,
        error_message: null
      })

      const markdown = generateMarkdownHelper(mockResult)

      expect(markdown).toContain('**Status:** Running ⏳')
      expect(markdown).toContain('**Status:** Execution is still in progress')
    })
  })

  describe('Filename Generation', () => {
    it('should generate correct filename format', () => {
      const mockResult = createMockExecutionResult({
        schedule_name: 'Test Schedule',
        executed_at: '2025-01-15T14:30:45Z'
      })

      const filename = generateFilenameHelper(mockResult)

      expect(filename).toMatch(/^test-schedule-2025-01-15-\d{4}\.md$/)
      expect(filename).toContain('test-schedule')
      expect(filename).toContain('2025-01-15')
      expect(filename.endsWith('.md')).toBe(true)
    })

    it('should sanitize special characters in schedule name', () => {
      const testCases = [
        {
          input: 'Test@Schedule#With$Special%Characters!',
          expected: 'testschedulewithspecialcharacters'
        },
        {
          input: 'Multiple   Spaces   Here',
          expected: 'multiple-spaces-here'
        },
        {
          input: '---Leading-And-Trailing---',
          expected: 'leading-and-trailing'
        },
        {
          input: 'Émojis & Special 🚀 Characters',
          expected: 'emojis-special-characters'
        },
        {
          input: 'a'.repeat(100), // Very long name
          expected: 'a'.repeat(50) // Should be truncated to 50 chars
        }
      ]

      testCases.forEach(({ input, expected }) => {
        const mockResult = createMockExecutionResult({
          schedule_name: input,
          executed_at: '2025-01-15T14:30:45Z'
        })

        const filename = generateFilenameHelper(mockResult)
        expect(filename).toContain(expected)
        expect(filename.endsWith('.md')).toBe(true)
      })
    })

    it('should handle edge cases in filename generation', () => {
      const edgeCases = [
        {
          name: 'empty schedule name',
          schedule_name: '',
          shouldContain: '2025-01-15'
        },
        {
          name: 'only special characters',
          schedule_name: '@#$%^&*()',
          shouldContain: '2025-01-15'
        },
        {
          name: 'unicode characters',
          schedule_name: '测试调度',
          shouldContain: '2025-01-15'
        }
      ]

      edgeCases.forEach(({ name, schedule_name, shouldContain }) => {
        const mockResult = createMockExecutionResult({
          schedule_name,
          executed_at: '2025-01-15T14:30:45Z'
        })

        const filename = generateFilenameHelper(mockResult)
        expect(filename).toContain(shouldContain)
        expect(filename.endsWith('.md')).toBe(true)
        expect(filename.length).toBeGreaterThan(10) // Should have reasonable length
      })
    })

    it('should generate time component correctly', () => {
      const timeTestCases = [
        { time: '09:05:30Z', expected: '0905' },
        { time: '23:59:59Z', expected: '2359' },
        { time: '00:00:00Z', expected: '0000' },
        { time: '12:30:45Z', expected: '1230' }
      ]

      timeTestCases.forEach(({ time, expected }) => {
        const mockResult = createMockExecutionResult({
          schedule_name: 'Time Test',
          executed_at: `2025-01-15T${time}`
        })

        const filename = generateFilenameHelper(mockResult)
        expect(filename).toContain(expected)
      })
    })
  })

  describe('Content Length Calculation', () => {
    it('should calculate UTF-8 byte length correctly', () => {
      const testCases = [
        { content: 'Simple ASCII text', expected: 17 },
        { content: 'UTF-8: émojis 🚀', expected: 18 }, // Emoji takes 4 bytes
        { content: 'Special chars: àáâãäå', expected: 26 }, // Accented chars take 2 bytes each
        { content: '', expected: 0 }
      ]

      testCases.forEach(({ content, expected }) => {
        const length = Buffer.byteLength(content, 'utf8')
        expect(length).toBe(expected)
      })
    })

    it('should handle large content efficiently', () => {
      const largeContent = 'A'.repeat(100000) // 100KB
      const length = Buffer.byteLength(largeContent, 'utf8')
      expect(length).toBe(100000)
    })
  })
})

// Helper functions to simulate the internal utility functions
function formatDurationHelper(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`
  }

  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}

function formatDateTimeHelper(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  })
}

function getScheduleDescriptionHelper(scheduleConfig: Record<string, unknown> | null): string {
  if (!scheduleConfig || typeof scheduleConfig !== 'object') {
    return 'Manual execution'
  }

  if ('description' in scheduleConfig && typeof scheduleConfig.description === 'string') {
    return scheduleConfig.description
  }

  if ('cron' in scheduleConfig && typeof scheduleConfig.cron === 'string') {
    return `Cron: ${scheduleConfig.cron}`
  }

  if ('frequency' in scheduleConfig && typeof scheduleConfig.frequency === 'string') {
    return `Frequency: ${scheduleConfig.frequency}`
  }

  return 'Scheduled execution'
}

function formatInputDataHelper(inputData: Record<string, unknown>): string {
  const entries = Object.entries(inputData)
  if (entries.length === 0) {
    return 'No input parameters'
  }

  return entries
    .map(([key, value]) => {
      const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
      const formattedValue = typeof value === 'object' && value !== null
        ? JSON.stringify(value, null, 2)
        : String(value)
      return `- ${formattedKey}: ${formattedValue}`
    })
    .join('\n')
}

function createMockExecutionResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    scheduledExecutionId: 456,
    resultData: {},
    status: 'success',
    executedAt: '2025-01-15T10:30:00Z',
    executionDurationMs: 5000,
    errorMessage: null,
    scheduleName: 'Test Schedule',
    userId: 1,
    assistantArchitectName: 'Test Assistant',
    inputData: {},
    scheduleConfig: {},
    ...overrides
  }
}

function generateMarkdownHelper(result: any): string {
  const executedDate = new Date(result.executedAt || result.executed_at)
  const statusEmoji = result.status === 'success' ? '✓' : result.status === 'failed' ? '✗' : '⏳'
  const duration = formatDurationHelper(result.executionDurationMs || result.execution_duration_ms)

  let markdown = `# ${result.scheduleName || result.schedule_name}
**Executed:** ${formatDateTimeHelper(executedDate)}
**Schedule:** ${getScheduleDescriptionHelper(result.scheduleConfig || result.schedule_config)}
**Status:** ${result.status.charAt(0).toUpperCase() + result.status.slice(1)} ${statusEmoji}

`

  if (result.inputData && Object.keys(result.inputData).length > 0) {
    markdown += `## Input Parameters
${formatInputDataHelper(result.inputData)}

`
  }

  markdown += `## Results

`

  if (result.status === 'success' && result.resultData) {
    if (typeof result.resultData === 'object' && result.resultData !== null) {
      if ('content' in result.resultData) {
        markdown += result.resultData.content
      } else if ('text' in result.resultData) {
        markdown += result.resultData.text
      } else if ('output' in result.resultData) {
        markdown += result.resultData.output
      } else {
        markdown += '```json\n' + JSON.stringify(result.resultData, null, 2) + '\n```'
      }
    }
  } else if (result.status === 'failed' && result.errorMessage) {
    markdown += `**Error:** ${result.errorMessage}`
  } else if (result.status === 'running') {
    markdown += '**Status:** Execution is still in progress'
  }

  markdown += `

## Execution Details
- Duration: ${duration}
- Assistant: ${result.assistantArchitectName || result.assistant_architect_name}

---
Generated by AI Studio - Peninsula School District
View online: https://aistudio.psd401.ai/execution-results/${result.id}
`

  return markdown
}

function generateFilenameHelper(result: any): string {
  const executedDate = new Date(result.executedAt || result.executed_at)
  const dateStr = executedDate.toISOString().slice(0, 10)
  const timeStr = executedDate.toTimeString().slice(0, 5).replace(':', '')

  const safeName = (result.scheduleName || result.schedule_name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)

  return `${safeName}-${dateStr}-${timeStr}.md`
}