interface LatimierAIConfig {
  apiKey: string
}

interface LatimierAIResponse {
  content: string
  model: string
}

export async function generateLatimierCompletion(
  config: LatimierAIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<LatimierAIResponse> {
  console.log("Latimer config:", { 
    hasKey: !!config.apiKey,
    keyLength: config.apiKey?.length,
    keyType: typeof config.apiKey,
    keyFirstChar: config.apiKey?.[0],
    keyLastChar: config.apiKey?.[config.apiKey.length - 1]
  })

  if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
    console.error("API key validation failed:", {
      exists: !!config.apiKey,
      type: typeof config.apiKey,
      isEmpty: config.apiKey?.trim() === ''
    })
    throw new Error("API key is required for execution")
  }

  const response = await fetch("https://api.latimer.ai/getCompletion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      apiKey: config.apiKey.trim(),
      message: `${systemPrompt}\n\nUser Input: ${userPrompt}`
    })
  })

  if (!response.ok) {
    const text = await response.text()
    console.error("Latimer API Error Details:", {
      status: response.status,
      statusText: response.statusText,
      responseText: text,
      requestBody: {
        apiKey: "***" + config.apiKey.slice(-4),
        messageLength: `${systemPrompt}\n\nUser Input: ${userPrompt}`.length
      },
      headers: Object.fromEntries(response.headers.entries())
    })

    let message = "Failed to generate completion"
    try {
      const error = JSON.parse(text)
      message = error.message || message
    } catch {
      message = `API Error (${response.status}): ${response.statusText}\nResponse: ${text}`
    }
    throw new Error(message)
  }

  const result = await response.text()
  return {
    content: result,
    model: "latimer-ai"
  }
} 