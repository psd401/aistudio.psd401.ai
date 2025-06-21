import { createAuthRouteHandlers } from "@/app/utils/amplifyServerUtils";

export const GET = createAuthRouteHandlers({
  redirectOnSignInComplete: "/dashboard",
  redirectOnSignOutComplete: "/",
}); 