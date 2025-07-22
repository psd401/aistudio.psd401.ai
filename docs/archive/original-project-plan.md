# Enterprise Next.js 14+ Template Specification (Revised)

> **⚠️ ARCHIVED DOCUMENT - OUTDATED**  
> This document reflects the original project plan using Clerk authentication and Supabase.  
> The current implementation uses AWS Cognito + NextAuth v5 and AWS RDS Aurora Serverless v2.  
> See `/docs/SPECIFICATION.md` for current architecture.

  

This is a detailed spec for building an internal enterprise Next.js 14+ template with Clerk authentication, Drizzle ORM + Supabase, AWS Amplify hosting, role-based access, automatic user creation at sign-in (with lowest permissions), and a test-driven approach to ensure stability.

  

---

  

## 1. Project Overview

  

- **Use Case**: Internal enterprise apps with tightly controlled access. 
- **Key Technologies**: 

1. **Next.js 14+ (App Router)**

2. **UI/Styling**: Shadcn UI with Tailwind CSS

3. **Auth**: [Clerk](https://clerk.com/). 

4. **Database**: [Drizzle ORM](https://orm.drizzle.team/) + [Supabase](https://supabase.com/). 

5. **Hosting**: [AWS Amplify](https://aws.amazon.com/amplify/). 

- **Access Policy**: 
- No public signups. Users are invited or sign in using a known account. 
- A new user found on Clerk sign-in gets created in the local DB with the lowest permission role.

  

## 2. High-Level Requirements

  

1. **Role-Based Access Control**

- Multiple roles (e.g., `Admin`, `Manager`, `Staff`). 
- Server-side checks for sensitive routes (e.g., `/admin`). 
- Client-side checks to hide or show certain UI elements. 

  

2. **Automatic User Creation**

- When a user logs in via Clerk the first time, the system checks if they exist in the DB: 
- If not, create a new entry in the `users` table with `lowest` (or default) role. 
- Administrative tools handle upgraded roles, so no public user creation. 

  

3. **Stunning UI**

- Use a modern, enterprise-friendly design system for consistency. 
- Example pages: `/dashboard` (general user), `/admin` (admin-only). 

  

4. **Test-Driven Development (TDD) & Other Testing**

- Write unit tests and integration tests before writing the implementation code. 
- Consider libraries like Jest for unit tests, Playwright/Cypress for integration. 
- Maintain good test coverage to ensure stable clones of this template. 

  

5. **AWS Amplify Deployment**

- Connect Git repo, set environment variables, configure build. 
- Automatic CI/CD with each push to the main branch. 

  

---

  

## 3. Folder & File Structure

root/

┣ 📄 package.json

┣ 📄 next.config.js

┣ 📄 .env.local (ignored by Git for local dev)

┣ 📂 app/

┃ ┣ 📂 (app router pages + layouts)

┃ ┃ ┣ 📂 dashboard/

┃ ┃ ┃ ┗ 📄 page.tsx (example user dashboard)

┃ ┃ ┣ 📂 admin/

┃ ┃ ┃ ┗ 📄 page.tsx (admin-specific dashboard)

┃ ┃ ┣ 📄 layout.tsx (providers, ClerkProvider, global layout)

┃ ┃ ┗ 📄 page.tsx (landing or "Welcome" page)

┣ 📂 lib/

┃ ┣ 📄 db.ts (Drizzle + Supabase config)

┃ ┣ 📄 auth.ts (Clerk auth helpers)

┣ 📂 components/

┃ ┣ 📄 NavBar.tsx

┃ ┣ 📄 SideBar.tsx

┃ ┗ ... (common UI components)

┣ 📂 hooks/ (custom hooks if needed)

┣ 📂 styles/ (global styling, tailwind.css or theme config)

┣ 📂 migrations/ (Drizzle migration scripts)

┣ 📂 tests/

┃ ┣ 📄 unit/ (unit tests)

┃ ┣ 📄 integration/ (integration/e2e tests)

┃ ┗ ... (test setup + configs)

...

  
  

---

  

## 4. Authentication & Automatic User Creation

  

1. **Clerk Setup**

- In `/app/layout.tsx`, wrap `<ClerkProvider>` around the app. 
- Use Clerk server API in route handlers (App Router) to secure routes.

  

2. **New User Handling**

- When a user signs in, call a server action or route to check if `clerk_id` exists in the DB. 
- If not found, insert them with `role = 'Staff'` (or similar lowest permission). 

  

3. **Role Enforcement**

- **Server-Side**:

```ts:path/to/server-route.ts

import { currentUser } from '@clerk/nextjs/app-beta';

import { db } from '~/lib/db';

import { NextResponse } from 'next/server';

  

export async function GET() {

const user = await currentUser();

if (!user) return NextResponse.redirect('/');

// Check user's role from your DB

const dbUser = await db.query.users.findFirst({

where: (tbl) => tbl.clerk_id.equals(user.id),

});

  

if (!dbUser || dbUser.role !== 'Admin') {

return NextResponse.error();

}

  

// proceed with admin logic

}

```

- **Client-Side**:

```tsx:path/to/admin-panel.tsx

import { useEffect, useState } from 'react';

import { useUser } from '@clerk/nextjs';

  

export default function AdminPanel() {

const { user } = useUser();

const [role, setRole] = useState<string | null>(null);

  

useEffect(() => {

// fetch DB role from your API

// setRole(fetchedRole);

}, []);

  

if (role !== 'Admin') {

return <div>Access Denied</div>;

}

  

return <div>Welcome to Admin Panel</div>;

}

```

  

---

  

## 5. Database & Drizzle ORM

  

1. **Configuration**

```ts:path/to/lib/db.ts

import { createClient } from '@supabase/supabase-js';

import { drizzle } from 'drizzle-orm/supabase';

  

const supabaseUrl = process.env.SUPABASE_URL!;

const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

  

const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export const db = drizzle(supabaseClient);

```

  

2. **Schema & Migrations**

```ts:path/to/migrations/0001_create_users_table.ts

import { sql } from 'drizzle-orm';

  

export const up = sql`

CREATE TABLE IF NOT EXISTS users (

id SERIAL PRIMARY KEY,

clerk_id VARCHAR(255) NOT NULL UNIQUE,

role VARCHAR(50) NOT NULL DEFAULT 'Staff',

created_at TIMESTAMP DEFAULT NOW()

);

`;

  

export const down = sql`

DROP TABLE IF EXISTS users;

`;

```

  

---

  

## 6. UI & Design Details

  

1. **Styling Library**

- **Tailwind**: Minimal `tailwind.config.js` and `globals.css`. 
- **Shadcn**: Provide a wrapped theme provider in layout. 

  

2. **Typical Components**

- **NavBar**: Displays user info, sign-out, or any global actions. 
- **Dashboard**: General overview page for authenticated users. 
- **Admin Panel**: Restrict to `Admin` role. 

  

3. **Design Best Practices**

- Use a consistent color palette, spacing, fonts. 
- Maintain responsiveness. 
- Leverage theming to adapt brand visuals across clones.

  

---

  

## 7. Test-Driven Development & Quality Assurance

  

1. **TDD Approach**

- Write tests before implementing features:
- Unit tests for components, utility functions, database logic. 
- Integration/E2E tests for authentication flow, role-based routing, DB migrations. 

  

2. **Frameworks & Examples**

- **Jest** for unit tests. 
- **Playwright** or **Cypress** for integration tests. 
- **Example Unit Test**:

```ts:path/to/tests/unit/db.test.ts

import { db } from '~/lib/db';

  

describe('Database Tests', () => {

test('should fetch user role correctly', async () => {

// arrange

// insert test user in a test environment

// act

// query user from db

  

// assert

// expect role to match what was inserted

});

});

```

  

3. **CI/CD Integration**

- Configure AWS Amplify test phase or GitHub Actions to run `npm test` (and possibly `npm run e2e`) before building. 
- Keep test results available in your CI logs.

  

---

  

## 8. AWS Amplify Deployment

  

1. **Repository Connection**

- Link your Git repo in the Amplify console. 

  

2. **Build Settings**

```yaml:.amplify.yml

version: 1

frontend:

phases:

preBuild:

commands:

- npm ci
- npm run test # or your combined test scripts for TDD

build:

commands:

- npm run build

artifacts:

baseDirectory: .next

files:

- '**/*'

cache:

paths:

- node_modules/**/*

```

3. **Environment Variables**

- Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CLERK_PUBLISHABLE_KEY`, etc. in Amplify console. 
- Securely store secrets (do not commit to source control). 

  

4. **Continuous Deployment**

- Automatic builds and deployments on push to your main branch. 

  

---

  

## 9. Extensibility & Next Steps

  

1. **Multiple Environments**

- Separate Amplify environments for staging/production. 
- Use separate `.env` variable sets in each environment. 

  

2. **Additional Roles / Modules**

- Expand your DB schema for new roles. 
- Provide admin pages for user management, advanced reporting, etc. 

  

3. **Logging & Monitoring**

- Integrate logging or observability (e.g., Winston, DataDog, Sentry). 

  

4. **Ongoing Testing & Maintenance**

- Maintain test coverage and update tests as features grow. 
- Prioritize TDD or BDD processes so the template remains stable. 

  

---

  

### Final Notes

  

- This revised spec supports a TDD approach and automatic user creation with the lowest role. 
- Modify or remove any sections to fit your enterprise's use case. 
- The structure and environment variables should remain consistent to streamline future clones.

  

**Sources:**

- Next.js 14 + App Router Docs 
- Clerk Docs 
- Drizzle ORM Docs 
- Supabase Docs 
- AWS Amplify Docs
