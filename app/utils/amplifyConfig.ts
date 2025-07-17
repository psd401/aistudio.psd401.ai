// Create config function to handle missing environment variables gracefully
export const config = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
      region: process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
      signUpVerificationMethod: "code",
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '',
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [
            "http://localhost:3000/",
            "http://localhost:3000",
            process.env.AUTH_URL ? `${process.env.AUTH_URL}/` : '',
            process.env.AUTH_URL || ''
          ].filter(Boolean),
          redirectSignOut: [
            "http://localhost:3000/",
            "http://localhost:3000",
            process.env.AUTH_URL ? `${process.env.AUTH_URL}/` : '',
            process.env.AUTH_URL || ''
          ].filter(Boolean),
          responseType: "code"
        }
      }
    }
  },
  ssr: true
}; 