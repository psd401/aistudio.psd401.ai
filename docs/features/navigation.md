# Navigation System

The navigation system provides a dynamic, role-based sidebar menu that adapts to user permissions. It consists of a database structure, API endpoint, and UI components.

## Key Features

- **Role-Based Access**: Navigation items can be restricted to users with specific roles
- **Tool-Based Access**: Navigation items can require specific tool permissions
- **Hierarchical Structure**: Support for sections (dropdowns) and child links
- **Responsive Design**: Works on both mobile and desktop
- **Dynamic Updates**: Updates in real-time when user permissions change

## Database Schema

Navigation items are stored in the `navigation_items` table with the following schema:

- `id`: Unique identifier for the item (e.g., "dashboard", "admin")
- `label`: Display label (e.g., "Dashboard", "Admin")
- `icon`: Icon name from the iconMap (e.g., "IconHome", "IconShield")
- `link`: URL for direct links, null for dropdown sections
- `parentId`: Reference to parent item for nested structure, null for top-level items
- `parentLabel`: Display label of parent (for easier reference)
- `toolId`: Reference to required tool ID for access control, null if no tool required
- `position`: Order within its parent level
- `isActive`: Whether the item is active and should be displayed

## Structure

1. **Top-level items (sections)**: Items with `parentId = null`
2. **Child items**: Items with a `parentId` referencing a top-level item

## API

The navigation API is available at `/api/navigation` and returns items filtered by user permissions:

```typescript
// GET /api/navigation
{
  isSuccess: true,
  data: [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "IconHome",
      link: "/dashboard",
      parent_id: null,
      parent_label: null,
      tool_id: null,
      position: 0
    },
    // ... more items
  ]
}
```

## Components

### NavbarNested

Main navigation component that:
- Renders both mobile and desktop navigation
- Fetches items from the API based on user permissions
- Processes raw items into a structured format for display

### LinksGroup

Renders a single navigation item as either:
- A direct link (for items with `link` property)
- A collapsible dropdown (for items with child links)

## Usage Example

To add a new navigation item:

1. **Add to Database**: Insert a record into the `navigation_items` table
2. **Assign Tool Permissions**: If needed, associate with a tool ID
3. **Update Icon Map**: Ensure the icon is available in the iconMap

## Icon Support

Available icons are defined in the `iconMap` in `navbar-nested.tsx`. To add a new icon:

1. Import the icon from `@tabler/icons-react`
2. Add it to the iconMap with its string name

Example:
```typescript
import { IconNewIcon } from '@tabler/icons-react';

const iconMap = {
  // ... existing icons,
  IconNewIcon
};
``` 