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
  console.log("Initializing Latimer AI client")

  if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
    console.error("Latimer API key validation failed")
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
      messageLength: `${systemPrompt}\n\nUser Input: ${userPrompt}`.length,
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