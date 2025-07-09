"use server"

import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import logger from "@/lib/logger"

export async function GET() {
  try {
    const imagesDir = path.join(process.cwd(), "public", "assistant_logos")
    const files = fs.readdirSync(imagesDir)
    const images = files.filter(file => file.endsWith(".png"))
    
    return NextResponse.json({ images })
  } catch (error) {
    logger.error("Error reading assistant images:", error)
    return NextResponse.json({ error: "Failed to load images" }, { status: 500 })
  }
} 