"use server"

import {
  getUserByCognitoSub,
  createUser,
  getRoleByName,
  assignRoleToUser,
  getUserRolesByCognitoSub,
  executeSQL,
  FormattedRow
} from "@/lib/db/data-api-adapter"
import { SqlParameter } from "@aws-sdk/client-rds-data"
import { getServerSession } from "@/lib/auth/server-session"
import { ActionState } from "@/types"
import { SelectUser } from "@/types/db-types"
import logger from "@/lib/logger"
import { transformSnakeToCamel } from '@/lib/db/field-mapper'

interface CurrentUserWithRoles {
  user: SelectUser
  roles: { id: number; name: string; description?: string }[]
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
    let user: SelectUser | null = null
    const userResult = await getUserByCognitoSub(session.sub)
    if (userResult) {
      user = transformSnakeToCamel<SelectUser>(userResult as FormattedRow)
    }

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
      const result = await executeSQL<FormattedRow>(query, parameters)
      
      if (result.length > 0) {
        // User exists with this email but different cognito_sub
        // Update the cognito_sub to link to the new auth system
        const existingUser = transformSnakeToCamel<SelectUser>(result[0])
        
        const updateQuery = `
          UPDATE users
          SET cognito_sub = :cognitoSub, updated_at = NOW()
          WHERE id = :userId
          RETURNING id, cognito_sub, email, first_name, last_name, created_at, updated_at
        `
        const updateParams: SqlParameter[] = [
          { name: "cognitoSub", value: { stringValue: session.sub } },
          { name: "userId", value: { longValue: existingUser.id } }
        ]
        const updateResult = await executeSQL<FormattedRow>(updateQuery, updateParams)
        user = transformSnakeToCamel<SelectUser>(updateResult[0])
      }
    }

    // If user still doesn't exist, create them
    if (!user) {
      const newUserResult = await createUser({
        cognitoSub: session.sub,
        email: session.email || `${session.sub}@cognito.local`,
        firstName: session.email?.split("@")[0] || "User"
      })
      user = transformSnakeToCamel<SelectUser>(newUserResult as FormattedRow)

      // Assign default "student" role to new users
      const studentRoleResult = await getRoleByName("student")
      if (studentRoleResult.length > 0) {
        const studentRole = studentRoleResult[0] as FormattedRow
        const roleId = studentRole.id as number
        await assignRoleToUser(user!.id, roleId)
      }
    }

    // Update last_sign_in_at
    const updateLastSignInQuery = `
      UPDATE users
      SET last_sign_in_at = NOW(), updated_at = NOW()
      WHERE id = :userId
      RETURNING id, cognito_sub, email, first_name, last_name, last_sign_in_at, created_at, updated_at
    `
    const updateLastSignInParams: SqlParameter[] = [
      { name: "userId", value: { longValue: user.id } }
    ]
    const updateResult = await executeSQL<FormattedRow>(updateLastSignInQuery, updateLastSignInParams)
    user = transformSnakeToCamel<SelectUser>(updateResult[0])

    // Get user's roles
    const roleNames = await getUserRolesByCognitoSub(session.sub)
    const roles = await Promise.all(
      roleNames.map(async name => {
        const roleResult = await getRoleByName(name)
        if (roleResult.length > 0) {
          const role = roleResult[0] as FormattedRow
          return {
            id: role.id as number,
            name: role.name as string,
            description: role.description as string | undefined
          }
        }
        return null
      })
    )

    return {
      isSuccess: true,
      message: "ok",
      data: { user, roles: roles.filter((role): role is NonNullable<typeof role> => role !== null) }
    }
  } catch (err) {
    logger.error("getCurrentUserAction error", err)
    return { isSuccess: false, message: "DB error" }
  }
} 