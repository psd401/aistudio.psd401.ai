import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Home, LogIn, Mail } from "lucide-react"
import Link from "next/link"
import { getCurrentUserAction } from "@/actions/db/get-current-user-action"

// Force dynamic rendering to allow headers() usage in server actions
export const dynamic = 'force-dynamic'

export default async function UnauthorizedPage() {
  const userResult = await getCurrentUserAction()
  const userRoles = userResult.isSuccess && userResult.data 
    ? userResult.data.roles.map(r => r.name) 
    : []

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle>Access Denied</CardTitle>
          </div>
          <CardDescription>
            You don&apos;t have permission to access this resource
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              This page requires specific permissions that your account doesn&apos;t currently have.
              {userRoles.length > 0 && (
                <>
                  <br />
                  <br />
                  Your current role{userRoles.length > 1 ? 's' : ''}: <strong>{userRoles.join(', ')}</strong>
                </>
              )}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">What you can do:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>
                  If you believe you should have access, contact your administrator to request the appropriate permissions.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>
                  Return to your dashboard to access resources available to your role.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>
                  If you&apos;re experiencing issues, try signing out and signing back in.
                </span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button asChild>
              <Link href="/dashboard">
                <Home className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Link>
            </Button>
            
            <Button variant="outline" asChild>
              <Link href="mailto:support@aistudio.psd401.ai">
                <Mail className="mr-2 h-4 w-4" />
                Contact Support
              </Link>
            </Button>

            <Button variant="ghost" asChild>
              <Link href="/auth/signin">
                <LogIn className="mr-2 h-4 w-4" />
                Sign In Again
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}