# Model Selector Component

## Overview

The Model Selector is a unified, reusable component for selecting AI models throughout the application. It provides rich model information display, capability-based filtering, role-based access control, and an improved user interface with searchable, scrollable dropdowns.

## Features

- **Rich Model Display**: Shows model name, description, and provider/ID information
- **Searchable Dropdown**: Built-in search functionality for quick model discovery
- **Capability Filtering**: Filter models based on required capabilities
- **Role-Based Access**: Restrict models to specific user roles
- **Grouped Display**: Organize models by provider for better navigation
- **Accessibility**: Full keyboard navigation and screen reader support
- **Performance**: Optimized for large model lists with virtual scrolling support

## Installation

The component is located at `/components/features/model-selector/`

## Basic Usage

```tsx
import { ModelSelector } from "@/components/features/model-selector"

function MyComponent() {
  const [selectedModel, setSelectedModel] = useState<SelectAiModel | null>(null)
  
  return (
    <ModelSelector
      models={models}
      value={selectedModel}
      onChange={setSelectedModel}
      placeholder="Select a model"
    />
  )
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `models` | `SelectAiModel[]` | `[]` | Array of available models |
| `value` | `SelectAiModel \| null` | - | Currently selected model |
| `onChange` | `(model: SelectAiModel) => void` | - | Callback when model is selected |
| `requiredCapabilities` | `string[]` | `[]` | Filter models by required capabilities |
| `placeholder` | `string` | `"Select a model"` | Placeholder text |
| `disabled` | `boolean` | `false` | Disable the selector |
| `className` | `string` | - | Additional CSS classes |
| `allowedRoles` | `string[]` | `[]` | Filter models by allowed roles |
| `groupByProvider` | `boolean` | `true` | Group models by provider |
| `showDescription` | `boolean` | `true` | Show model descriptions |
| `virtualizeThreshold` | `number` | `50` | Number of items before virtualization |
| `searchable` | `boolean` | `true` | Enable search functionality |
| `loading` | `boolean` | `false` | Show loading state |
| `error` | `string` | - | Error message to display |

## Advanced Usage

### With Capability Filtering

```tsx
<ModelSelector
  models={models}
  value={selectedModel}
  onChange={setSelectedModel}
  requiredCapabilities={["chat", "code_interpreter"]}
  placeholder="Select a chat model"
/>
```

### With Role-Based Access

```tsx
<ModelSelector
  models={models}
  value={selectedModel}
  onChange={setSelectedModel}
  allowedRoles={["administrator", "staff"]}
  placeholder="Select an admin model"
/>
```

### In Forms (with string values)

Use the `ModelSelectorFormAdapter` for form libraries that expect string values:

```tsx
import { ModelSelectorFormAdapter } from "@/components/features/model-selector/model-selector-form-adapter"

<ModelSelectorFormAdapter
  models={models}
  value={modelId} // string ID
  onValueChange={setModelId} // (value: string) => void
  placeholder="Select an AI model"
/>
```

## Database Schema

The component expects models with the following structure:

```typescript
interface SelectAiModel {
  id: number
  name: string
  modelId: string
  provider: string | null
  description: string | null
  capabilities: string | null // JSON array as string
  maxTokens: number | null
  active: boolean
  chatEnabled: boolean
  allowedRoles?: string | null // JSON array as string
}
```

### Role Restrictions

Models can be restricted to specific roles using the `allowed_roles` column:

```sql
-- Example: Restrict a model to administrators only
UPDATE ai_models 
SET allowed_roles = '["administrator"]'::jsonb
WHERE model_id = 'gpt-4-turbo';

-- Example: Allow staff and administrators
UPDATE ai_models 
SET allowed_roles = '["administrator", "staff"]'::jsonb
WHERE model_id = 'claude-3-sonnet';

-- NULL means accessible to all roles
UPDATE ai_models 
SET allowed_roles = NULL
WHERE model_id = 'gpt-3.5-turbo';
```

### Capabilities

Models can have capabilities defined as a JSON array:

```sql
-- Example capabilities
UPDATE ai_models 
SET capabilities = '["chat", "code_interpreter", "web_search", "image_generation"]'::jsonb
WHERE model_id = 'gpt-4-turbo';
```

## Integration Examples

### Chat Page

```tsx
<ModelSelector
  models={models}
  value={selectedModel}
  onChange={setSelectedModel}
  requiredCapabilities={["chat"]}
  placeholder="Select a chat model"
  showDescription={true}
  groupByProvider={true}
/>
```

### Model Comparison

```tsx
// First model
<ModelSelector
  models={models}
  value={model1}
  onChange={setModel1}
  placeholder="Select first model"
  showDescription={false}
/>

// Second model  
<ModelSelector
  models={models}
  value={model2}
  onChange={setModel2}
  placeholder="Select second model"
  showDescription={false}
/>
```

## Accessibility

The component includes:
- Proper ARIA labels and roles
- Keyboard navigation (Arrow keys, Enter, Escape)
- Screen reader announcements
- Focus management
- High contrast mode support

## Performance

- Models are filtered and grouped using memoization
- Virtual scrolling activates automatically for lists > 50 items
- Search is debounced to reduce re-renders
- Component uses React.memo for optimization

## Migration Guide

To replace old model selectors:

1. Update imports:
```tsx
// Old
import { ModelSelector } from "@/app/(protected)/chat/_components/model-selector"

// New
import { ModelSelector } from "@/components/features/model-selector"
```

2. Update props:
```tsx
// Old
<ModelSelector
  models={models}
  selectedModel={selectedModel}
  onModelSelect={setSelectedModel}
/>

// New
<ModelSelector
  models={models}
  value={selectedModel}
  onChange={setSelectedModel}
/>
```

## Troubleshooting

### Models not showing
- Check that models are passed correctly
- Verify user has appropriate roles
- Check browser console for errors

### Role filtering not working
- Ensure user roles are fetched (`/api/user/roles`)
- Verify `allowed_roles` format in database
- Check that roles match exactly (case-sensitive)

### Search not working
- Ensure `searchable` prop is not set to `false`
- Check that model properties are populated
- Verify no JavaScript errors in console