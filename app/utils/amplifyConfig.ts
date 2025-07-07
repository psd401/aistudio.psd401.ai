export const config = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
      region: process.env.NEXT_PUBLIC_AWS_REGION!,
      signUpVerificationMethod: "code",
      loginWith: {
        oauth: {
          domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN!,
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [
            "http://localhost:3000/",
            "https://dev.aistudio.psd401.ai/",
            "http://localhost:3000",
            "https://dev.aistudio.psd401.ai"
          ],
          redirectSignOut: [
            "http://localhost:3000/",
            "https://dev.aistudio.psd401.ai/",
            "http://localhost:3000",
            "https://dev.aistudio.psd401.ai"
          ],
          responseType: "code"
        }
      }
    }
  },
  ssr: true
}; 