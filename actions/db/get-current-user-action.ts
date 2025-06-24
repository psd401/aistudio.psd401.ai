"use server"

import {
  getUserByCognitoSub,
  createUser,
  getRoleByName,
  assignRoleToUser,
  getUserRolesByCognitoSub,
  executeSQL
} from "@/lib/db/data-api-adapter"
import { getServerSession } from "@/lib/auth/server-session"
import { ActionState } from "@/types"
import { SelectUser } from "@/types/db-types"

interface CurrentUserWithRoles {
  user: SelectUser
  roles: { id: string; name: string; description?: string }[]
}

export async function getCurrentUserAction(): Promise<
  ActionState<CurrentUserWithRoles>
> {
  const session = await getServerSession()
  if (!session) {
    return { isSuccess: false, message: "No session" }
  }

  try {
    // First try to find user by cognito_sub
    let user = await getUserByCognitoSub(session.sub)

    // If not found by cognito_sub, check if user exists by email
    if (!user && session.email) {
      const query = `
        SELECT id, cognito_sub, email, first_name, last_name,
               last_sign_in_at, created_at, updated_at
        FROM users
        WHERE email = :email
      `
      const parameters = [
        { name: "email", value: { stringValue: session.email } }
      ]
      const result = await executeSQL(query, parameters)
      
      if (result.length > 0) {
        // User exists with this email but different cognito_sub
        // Update the cognito_sub to link to the new auth system
        user = result[0]
        
        const updateQuery = `
          UPDATE users
          SET cognito_sub = :cognitoSub, updated_at = NOW()
          WHERE id = :userId
          RETURNING id, cognito_sub, email, first_name, last_name, created_at, updated_at
        `
        const updateParams = [
          { name: "cognitoSub", value: { stringValue: session.sub } },
          { name: "userId", value: { stringValue: user.id } }
        ]
        const updateResult = await executeSQL(updateQuery, updateParams)
        user = updateResult[0]
      }
    }

    // If user still doesn't exist, create them
    if (!user) {
      user = await createUser({
        cognitoSub: session.sub,
        email: session.email || `${session.sub}@cognito.local`,
        firstName: session.email?.split("@")[0] || "User"
      })

      // Assign default "student" role to new users
      const [studentRole] = await getRoleByName("student")
      if (studentRole) {
        await assignRoleToUser(user.id, studentRole.id)
      }
    }

    // Update last_sign_in_at
    const updateLastSignInQuery = `
      UPDATE users
      SET last_sign_in_at = NOW(), updated_at = NOW()
      WHERE id = :userId
      RETURNING id, cognito_sub, email, first_name, last_name, last_sign_in_at, created_at, updated_at
    `
    const updateLastSignInParams = [
      { name: "userId", value: { stringValue: user.id } }
    ]
    const updateResult = await executeSQL(updateLastSignInQuery, updateLastSignInParams)
    user = updateResult[0]

    // Get user's roles
    const roleNames = await getUserRolesByCognitoSub(session.sub)
    const roles = await Promise.all(
      roleNames.map(async name => (await getRoleByName(name))[0])
    )

    return {
      isSuccess: true,
      message: "ok",
      data: { user, roles: roles.filter(Boolean) }
    }
  } catch (err) {
    console.error("getCurrentUserAction error", err)
    return { isSuccess: false, message: "DB error" }
  }
} 