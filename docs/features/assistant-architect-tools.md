# Assistant Architect Tools

## Overview

Assistant Architect now supports AI tools like web search and code interpretation, allowing your custom assistants to access current information and perform complex tasks beyond their training data. This powerful feature enables assistants to provide up-to-date answers, perform calculations, and execute code in real-time.

## Supported Tools

### Web Search
- **Available for**: GPT-5, Gemini Pro models
- **Purpose**: Search the web for current information and real-time data
- **Use cases**:
  - Current events and breaking news
  - Latest product information and pricing
  - Real-time stock prices and market data
  - Recent research findings and publications
  - Current weather and local information
  - Fact-checking against up-to-date sources

**Example Prompt**: "Search for the latest developments in AI regulation in 2025 and summarize the key changes."

### Code Interpreter
- **Available for**: GPT-4o, GPT-5, Gemini Pro models
- **Purpose**: Execute Python code and perform data analysis
- **Use cases**:
  - Mathematical calculations and statistical analysis
  - Data processing and visualization
  - Code examples and programming demonstrations
  - Scientific computations
  - File processing and text analysis

**Example Prompt**: "Calculate the compound interest on $10,000 at 5% annual rate over 10 years and create a visualization."

## How to Enable Tools

### Creating a New Assistant with Tools

1. **Navigate to Assistant Architect**
   - Go to the Assistant Architect section in AI Studio
   - Click "Create New Assistant" or the "+" button

2. **Configure Basic Settings**
   - Enter a descriptive **Name** for your assistant
   - Add a **Description** explaining the assistant's purpose
   - Choose the **execution mode** (Sequential or Parallel)

3. **Select a Compatible Model**
   - Choose a model that supports tools:
     - **GPT-5**: Supports web search and code interpreter
     - **Gemini Pro**: Supports web search and code interpreter
     - **GPT-4o**: Supports code interpreter only
   - Models without tool support will not show tool options

4. **Add Prompts and Enable Tools**
   - Click "Add Prompt" to create your assistant's instructions
   - For each prompt, you can:
     - Write the prompt content
     - Select which tools to enable for that specific prompt
     - Configure tool-specific settings

5. **Tool Selection**
   - Check the boxes next to the tools you want to enable
   - **Web Search**: Enable for prompts requiring current information
   - **Code Interpreter**: Enable for prompts involving calculations or code
   - You can enable different tools for different prompts

6. **Save and Test**
   - Click "Save Assistant" to create your tool-enabled assistant
   - Test the assistant to verify tools are working correctly

### Editing Existing Assistants

1. **Open Assistant for Editing**
   - Find your assistant in the Assistant Architect list
   - Click the "Edit" button (pencil icon)

2. **Modify Tool Settings**
   - Navigate to the prompt you want to modify
   - Check or uncheck tool options as needed
   - Add new prompts with different tool configurations

3. **Update and Save**
   - Review your changes
   - Click "Save Changes" to update the assistant

## Best Practices

### When to Use Web Search
- ✅ **Good for**: Current events, latest prices, recent news, real-time data
- ✅ **Good for**: Fact-checking against current sources
- ✅ **Good for**: Finding latest versions of software, APIs, or documentation
- ❌ **Avoid for**: General knowledge questions that don't require current data
- ❌ **Avoid for**: Historical facts that don't change
- ❌ **Avoid for**: Personal or private information

### When to Use Code Interpreter
- ✅ **Good for**: Complex mathematical calculations
- ✅ **Good for**: Data analysis and visualization
- ✅ **Good for**: Code examples and programming tutorials
- ✅ **Good for**: Statistical analysis and scientific computing
- ❌ **Avoid for**: Simple arithmetic that can be done mentally
- ❌ **Avoid for**: Questions that don't require computation

### Tool Selection Strategy
- **Single Tool**: Use one tool per prompt for focused tasks
- **Multiple Tools**: Combine tools when tasks require both current data and computation
- **Sequential Prompts**: Use different tools across multiple prompts for complex workflows
- **Performance**: Consider execution time when using multiple tools (aim for <30 seconds total)

### Writing Effective Tool-Enabled Prompts

#### Web Search Prompts
```markdown
# Good Example
"Search for the current stock price of Tesla (TSLA) and compare it to its price 6 months ago. Analyze the trend and major factors affecting the change."

# Poor Example
"What is Tesla?" (too general, doesn't require current data)
```

#### Code Interpreter Prompts
```markdown
# Good Example
"Calculate the monthly payment for a $300,000 mortgage at 6.5% interest over 30 years. Show the calculation steps and create an amortization table for the first year."

# Poor Example
"What is 2 + 2?" (too simple for code interpreter)
```

#### Combined Tools Example
```markdown
"Search for the latest quarterly earnings data for Apple and Microsoft. Then calculate and visualize the revenue growth rates for both companies over the past 4 quarters."
```

## Performance Considerations

### Execution Times
- **Target**: Assistants should complete within 30 seconds
- **Web Search**: Typically adds 5-15 seconds to execution
- **Code Interpreter**: Typically adds 3-10 seconds depending on complexity
- **Multiple Tools**: May execute in parallel when possible

### Optimization Tips
- Write specific, focused prompts to minimize tool usage time
- Avoid redundant web searches within the same execution
- Use code interpreter for complex calculations, not simple arithmetic
- Test your assistants regularly to ensure consistent performance

### Success Rate Expectations
- **Target**: >95% successful execution rate
- Failed executions are typically due to:
  - Network connectivity issues
  - API rate limiting
  - Overly complex or ambiguous prompts
  - Timeout due to long-running computations

## Troubleshooting

### Common Issues

#### "No tools available for this model"
- **Cause**: Selected model doesn't support tools
- **Solution**: Switch to GPT-5, GPT-4o, or Gemini Pro model

#### Tool execution timeout
- **Cause**: Network issues or high API load
- **Solutions**:
  - Retry execution after a few minutes
  - Simplify prompts to reduce execution time
  - Check system status page for known issues

#### Inconsistent tool results
- **Cause**: External search results naturally vary
- **Solutions**:
  - Use more specific search terms
  - Add context about desired information type
  - Include date ranges or geographical constraints

#### Code execution errors
- **Cause**: Invalid code or unsupported operations
- **Solutions**:
  - Review prompt for clarity and correctness
  - Avoid file system operations or external API calls
  - Use standard Python libraries and simple computations

### Getting Help

If you encounter persistent issues:

1. **Check Tool Status**: Verify that tools are properly enabled for your prompts
2. **Review Prompts**: Ensure prompts are clear and specific
3. **Test with Simple Examples**: Try basic tool functionality first
4. **Contact Support**: Provide execution ID and error details

## Security and Privacy

### Data Handling
- Web search results are processed securely and not stored permanently
- Code execution happens in isolated environments
- No personal data is sent to external tool services
- All tool usage is logged for monitoring and debugging

### Best Practices
- Avoid including sensitive information in tool-enabled prompts
- Review tool outputs before sharing with others
- Use tools responsibly and respect rate limits
- Follow your organization's data handling policies

## Advanced Features

### Multi-Prompt Workflows
Create sophisticated assistants with different tools for different steps:

1. **Research Phase**: Use web search to gather current information
2. **Analysis Phase**: Use code interpreter to process and analyze data
3. **Summary Phase**: Combine results without additional tool usage

### Parallel Execution
When enabled, prompts with different tools can execute simultaneously:
- Reduces overall execution time
- Useful for independent tasks
- Configure in assistant settings

### Repository Integration
Tools work seamlessly with knowledge repositories:
- Web search can supplement repository knowledge with current data
- Code interpreter can analyze files and documents from repositories
- Combine internal knowledge with external, real-time information

## API Integration

For developers integrating with Assistant Architect tools:

### Execution Status Monitoring
```json
{
  "executionId": "exec_123",
  "status": "running",
  "toolsUsed": ["web_search", "code_interpreter"],
  "progress": {
    "web_search": "completed",
    "code_interpreter": "running"
  }
}
```

### Tool Configuration
```json
{
  "promptId": "prompt_456",
  "enabledTools": ["web_search"],
  "toolSettings": {
    "web_search": {
      "maxResults": 10,
      "timeRange": "recent"
    }
  }
}
```

## Frequently Asked Questions

### Can I use tools with any AI model?
No, tools are only available for specific models that support them. Currently: GPT-5, GPT-4o, and Gemini Pro.

### Do tools cost extra?
Tool usage is included in your AI Studio subscription, but may consume additional compute credits based on usage.

### Can I disable tools temporarily?
Yes, you can edit any assistant to disable tools without deleting the assistant configuration.

### How current is web search data?
Web search provides real-time access to current web content, typically within minutes of publication.

### What programming languages are supported in code interpreter?
Currently, only Python is supported, with access to standard scientific and data analysis libraries.

### Can tools access my private data?
No, tools operate in isolated environments and cannot access your private files or systems unless explicitly provided through the assistant interface.

---

*Last updated: September 2025*
*For technical support, contact your AI Studio administrator*