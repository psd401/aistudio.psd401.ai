"use server"

import { ActionState } from "@/types"
import { Settings } from "@/lib/settings-manager"
import { getServerSession } from "@/lib/auth/server-session"
import { 
  handleError,
  ErrorFactories,
  createSuccess
} from "@/lib/error-utils"
import {
  createLogger,
  generateRequestId,
  startTimer,
  sanitizeForLogging
} from "@/lib/logger"

interface CreateFreshserviceTicketInput {
  title: string
  description: string
  screenshot?: File | null
}

interface FreshserviceTicketResponse {
  ticket_url: string
  ticket_id: number
}

export async function createFreshserviceTicketAction(
  formData: FormData
): Promise<ActionState<FreshserviceTicketResponse>> {
  const requestId = generateRequestId()
  const timer = startTimer("createFreshserviceTicket")
  const log = createLogger({ requestId, action: "createFreshserviceTicket" })
  
  try {
    // Extract form data
    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const screenshot = formData.get('screenshot') as File | null
    
    log.info("Action started: Creating Freshservice ticket", {
      titleLength: title?.length,
      descriptionLength: description?.length,
      hasScreenshot: !!screenshot
    })
    
    // Validate required fields
    if (!title || !description) {
      log.warn("Missing required fields", { title: !!title, description: !!description })
      const fields = []
      if (!title) fields.push({ field: "title", message: "Title is required" })
      if (!description) fields.push({ field: "description", message: "Description is required" })
      throw ErrorFactories.validationFailed(fields)
    }
    
    const session = await getServerSession()
    if (!session) {
      log.warn("Unauthorized Freshservice ticket creation attempt")
      throw ErrorFactories.authNoSession()
    }
    
    log.debug("User authenticated", { userId: session.sub })
    
    const settings = await Settings.getFreshservice()
    if (!settings.domain || !settings.apiKey || !settings.departmentId) {
      log.error("Freshservice not configured", { 
        hasDomain: !!settings.domain, 
        hasApiKey: !!settings.apiKey,
        hasDepartmentId: !!settings.departmentId 
      })
      return { 
        isSuccess: false, 
        message: "Freshservice not configured. Please contact your administrator to set up FRESHSERVICE_DOMAIN, FRESHSERVICE_API_KEY, and FRESHSERVICE_DEPARTMENT_ID." 
      }
    }
    
    // Prepare API request
    const apiUrl = `https://${settings.domain}.freshservice.com/api/v2/tickets`
    const encodedKey = Buffer.from(settings.apiKey + ":X").toString("base64")
    
    let response: Response
    
    // Check if we have a screenshot attachment
    const hasAttachment = screenshot && screenshot.size > 0
    
    if (hasAttachment) {
      // Validate screenshot
      const maxSizeBytes = 10 * 1024 * 1024 // 10MB
      if (screenshot.size > maxSizeBytes) {
        log.warn("Screenshot too large", { size: screenshot.size, maxSize: maxSizeBytes })
        throw ErrorFactories.validationFailed([
          { field: "screenshot", message: "Screenshot must be smaller than 10MB" }
        ])
      }
      
      // Validate file type
      if (!screenshot.type.startsWith('image/')) {
        log.warn("Invalid file type", { type: screenshot.type })
        throw ErrorFactories.validationFailed([
          { field: "screenshot", message: "Only image files are supported for screenshots" }
        ])
      }
      
      // Use multipart/form-data for requests with attachments
      const freshserviceFormData = new FormData()
      freshserviceFormData.append('subject', title)
      freshserviceFormData.append('description', description)
      freshserviceFormData.append('email', session.email || 'noreply@example.com')
      freshserviceFormData.append('priority', settings.priority)
      freshserviceFormData.append('status', settings.status)
      freshserviceFormData.append('department_id', settings.departmentId)
      freshserviceFormData.append('type', settings.ticketType)
      
      // Add workspace_id for multipart requests
      if (settings.workspaceId) {
        freshserviceFormData.append('workspace_id', settings.workspaceId)
      }
      
      freshserviceFormData.append('attachments[]', screenshot, screenshot.name || 'screenshot.png')
      
      log.info("Calling Freshservice API with attachment", {
        domain: settings.domain,
        titlePreview: title.substring(0, 50),
        priority: settings.priority,
        status: settings.status,
        hasWorkspace: !!settings.workspaceId,
        workspaceId: settings.workspaceId
      })
      
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${encodedKey}`
          // Note: Don't set Content-Type, fetch will set it with boundary for multipart/form-data
        },
        body: freshserviceFormData
      })
    } else {
      // Use JSON for requests without attachments
      const ticketData: any = {
        subject: title,
        description: description,
        email: session.email || 'noreply@example.com',
        priority: parseInt(settings.priority),
        status: parseInt(settings.status),
        department_id: parseInt(settings.departmentId),
        type: settings.ticketType
      }
      
      // Add workspace_id for JSON requests
      if (settings.workspaceId) {
        ticketData.workspace_id = parseInt(settings.workspaceId)
      }
      
      log.info("Calling Freshservice API with JSON", {
        domain: settings.domain,
        titlePreview: title.substring(0, 50),
        priority: settings.priority,
        status: settings.status,
        hasWorkspace: !!settings.workspaceId,
        workspaceId: settings.workspaceId
      })
      
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${encodedKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ticketData)
      })
    }
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      
      log.error("Freshservice API error", {
        status: response.status,
        statusText: response.statusText,
        error: sanitizeForLogging(errorData)
      })
      
      // Handle specific error cases
      if (response.status === 401) {
        throw ErrorFactories.externalServiceError("Freshservice", new Error("Invalid API key or unauthorized"))
      } else if (response.status === 404) {
        throw ErrorFactories.externalServiceError("Freshservice", new Error("Domain not found. Please check FRESHSERVICE_DOMAIN setting"))
      } else if (response.status >= 500) {
        throw ErrorFactories.externalServiceError("Freshservice", new Error("Freshservice server error. Please try again later"))
      }
      
      throw ErrorFactories.externalServiceError("Freshservice", new Error(errorData.message || `API returned ${response.status}`))
    }
    
    const ticket = await response.json()
    const ticketUrl = `https://${settings.domain}.freshservice.com/support/tickets/${ticket.id}`
    
    log.info("Freshservice ticket created successfully", {
      ticketUrl,
      ticketId: ticket.id,
      ticketNumber: ticket.display_id || ticket.id
    })
    
    timer({ status: "success", ticketId: ticket.id })
    
    return createSuccess(
      { 
        ticket_url: ticketUrl, 
        ticket_id: ticket.id 
      }, 
      "Ticket created successfully"
    )
  } catch (error) {
    timer({ status: "error" })
    
    return handleError(error, "Failed to create ticket. Please try again or contact support.", {
      context: "createFreshserviceTicket",
      requestId,
      operation: "createFreshserviceTicket",
      metadata: { 
        titleLength: formData.get('title')?.toString()?.length,
        hasScreenshot: !!formData.get('screenshot')
      }
    })
  }
}