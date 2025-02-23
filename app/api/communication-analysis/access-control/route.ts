import { NextResponse } from "next/server"
import { 
  getAccessControlsAction,
  updateAccessControlAction
} from "@/actions/db/communication-analysis-actions"

export async function GET() {
  try {
    const result = await getAccessControlsAction()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch access controls" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { userId, accessLevel } = body
  const result = await updateAccessControlAction(userId, { accessLevel })
  return NextResponse.json(result)
} 