/**
 * Decodes HTML entities and removes backslash escapes from prompt variables.
 * Used to process prompts before variable substitution.
 * 
 * @param content - The content string containing HTML entities and escaped variables
 * @returns The decoded content with proper variable syntax
 */
export function decodePromptVariables(content: string): string {
  // Replace HTML entity for $ with $
  let decoded = content.replace(/&#x24;|&#36;/g, '$');
  // Remove backslash escapes before $
  decoded = decoded.replace(/\\\$/g, '$');
  // Remove backslash escapes before {
  decoded = decoded.replace(/\\\{/g, '{');
  // Remove backslash escapes before }
  decoded = decoded.replace(/\\\}/g, '}');
  // Remove backslash escapes before _
  decoded = decoded.replace(/\\_/g, '_');
  return decoded;
}