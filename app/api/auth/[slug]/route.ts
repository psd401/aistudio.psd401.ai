import { createAuthRouteHandlers } from "@/app/utils/amplifyServerUtils";

const handlers = createAuthRouteHandlers({
  redirectOnSignInComplete: "/dashboard",
  redirectOnSignOutComplete: "/",
});

export const GET = handlers.GET;
export const POST = handlers.POST; 