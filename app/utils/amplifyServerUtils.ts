import { createServerRunner } from '@aws-amplify/adapter-nextjs';
import { config } from '@/app/utils/amplifyConfig';

export const { runWithAmplifyServerContext, createAuthRouteHandlers } = createServerRunner({
  config,
  runtimeOptions: {
    cookies: {
      sameSite: 'lax',
      // httpOnly and path are not supported here
      maxAge: 60 * 60 * 24 * 7 // 7 days
    }
  }
}); 