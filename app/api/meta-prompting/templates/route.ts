import { NextRequest, NextResponse } from "next/server"
import {
  createTemplateAction,
  deleteTemplateAction,
  getTemplatesAction,
  updateTemplateAction
} from "@/actions/db/meta-prompting-actions"

export async function GET() {
  const result = await getTemplatesAction()
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const template = await request.json()
  const result = await createTemplateAction(template)
  return NextResponse.json(result)
}

export async function PUT(request: NextRequest) {
  const template = await request.json()
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")
  
  if (!id) {
    return NextResponse.json({ 
      isSuccess: false, 
      message: "No template ID provided" 
    })
  }

  const result = await updateTemplateAction(id, template)
  return NextResponse.json(result)
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")
  
  if (!id) {
    return NextResponse.json({ 
      isSuccess: false, 
      message: "No template ID provided" 
    })
  }

  const result = await deleteTemplateAction(id)
  return NextResponse.json(result)
} 