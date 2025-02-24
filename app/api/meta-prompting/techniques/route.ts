import { NextRequest, NextResponse } from "next/server"
import {
  createTechniqueAction,
  deleteTechniqueAction,
  getTechniquesAction,
  updateTechniqueAction
} from "@/actions/db/meta-prompting-actions"

export async function GET() {
  const result = await getTechniquesAction()
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const technique = await request.json()
  const result = await createTechniqueAction(technique)
  return NextResponse.json(result)
}

export async function PUT(request: NextRequest) {
  const technique = await request.json()
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")
  
  if (!id) {
    return NextResponse.json({ 
      isSuccess: false, 
      message: "No technique ID provided" 
    })
  }

  const result = await updateTechniqueAction(id, technique)
  return NextResponse.json(result)
}

export async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")
  
  if (!id) {
    return NextResponse.json({ 
      isSuccess: false, 
      message: "No technique ID provided" 
    })
  }

  const result = await deleteTechniqueAction(id)
  return NextResponse.json(result)
} 