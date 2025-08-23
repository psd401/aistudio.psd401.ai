// Error capture utility for debugging
// This captures console errors and stores them for bug reports

interface WindowWithErrors extends Window {
  __capturedErrors?: string[]
}

export function initializeErrorCapture() {
  if (typeof window === 'undefined') return

  // Initialize error storage
  const win = window as unknown as WindowWithErrors
  win.__capturedErrors = []
  const maxErrors = 50 // Keep last 50 errors

  // Store original console.error
  // eslint-disable-next-line no-console
  const originalConsoleError = console.error

  // Override console.error to capture errors
  // eslint-disable-next-line no-console
  console.error = function(...args) {
    // Call original console.error
    originalConsoleError.apply(console, args)
    
    // Store error with timestamp
    const errorString = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.message} (${arg.stack?.split('\n')[1]?.trim() || 'no stack'})`
      }
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    }).join(' ')
    
    const timestamp = new Date().toISOString()
    const errorEntry = `[${timestamp}] ${errorString}`
    
    // Add to captured errors
    const win = window as unknown as WindowWithErrors
    const errors = win.__capturedErrors || []
    errors.push(errorEntry)
    win.__capturedErrors = errors
    
    // Keep only last N errors
    if (errors.length > maxErrors) {
      errors.shift()
    }
  }

  // Also capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const timestamp = new Date().toISOString()
    const errorEntry = `[${timestamp}] Unhandled Promise Rejection: ${event.reason}`
    
    const win = window as unknown as WindowWithErrors
    const errors = win.__capturedErrors || []
    errors.push(errorEntry)
    win.__capturedErrors = errors
    
    if (errors.length > maxErrors) {
      errors.shift()
    }
  })

  // Capture window errors
  window.addEventListener('error', (event) => {
    const timestamp = new Date().toISOString()
    const errorEntry = `[${timestamp}] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
    
    const win = window as unknown as WindowWithErrors
    const errors = win.__capturedErrors || []
    errors.push(errorEntry)
    win.__capturedErrors = errors
    
    if (errors.length > maxErrors) {
      errors.shift()
    }
  })
}