# Enterprise Next.js Template

A modern, production-ready template for building internal enterprise applications with Next.js 14+, featuring:

- 🔒 Authentication with [Clerk](https://clerk.com)
- 🗄️ Database with [Drizzle ORM](https://orm.drizzle.team) + [Supabase](https://supabase.com)
- 🎨 UI with [Shadcn](https://ui.shadcn.com)
- 🚀 Deployment with [AWS Amplify](https://aws.amazon.com/amplify)

## Features

- Role-based access control
- Automatic user creation on first sign-in
- Modern, responsive UI
- Type-safe database operations
- Test-driven development setup

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in your environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Set up your database:
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

## Testing

Run the test suite:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

## Database Management

- Generate migrations: `npm run db:generate`
- Push schema changes: `npm run db:push`
- Open Drizzle Studio: `npm run db:studio`

## Deployment

1. Set up an AWS Amplify project
2. Connect your repository
3. Configure environment variables in the Amplify Console
4. Deploy!

## License

MIT
