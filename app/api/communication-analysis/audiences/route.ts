"use server"

import { NextResponse } from "next/server"
import { 
  createAudienceAction, 
  deleteAudienceAction, 
  getAudiencesAction, 
  updateAudienceAction 
} from "@/actions/db/communication-analysis-actions"

export async function GET() {
  try {
    const result = await getAudiencesAction()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { isSuccess: false, message: "Failed to fetch audiences" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const body = await request.json()
  const result = await createAudienceAction(body)
  return NextResponse.json(result)
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { id, ...data } = body
  const result = await updateAudienceAction(id, data)
  return NextResponse.json(result)
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) {
    return NextResponse.json({ 
      isSuccess: false, 
      message: "Missing audience ID" 
    })
  }
  const result = await deleteAudienceAction(id)
  return NextResponse.json(result)
} 