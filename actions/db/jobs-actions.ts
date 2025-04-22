"use server"

import { db } from "@/db/db"
import { InsertJob, SelectJob, jobsTable } from "@/db/schema"
import { ActionState } from "@/types"
import { eq } from "drizzle-orm"
import { auth } from "@clerk/nextjs/server"

export async function createJobAction(
  job: Omit<InsertJob, "id" | "createdAt" | "updatedAt">
): Promise<ActionState<SelectJob>> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return { isSuccess: false, message: "Unauthorized" }
    }

    const [newJob] = await db.insert(jobsTable).values({
      ...job,
      userId
    }).returning()

    return {
      isSuccess: true,
      message: "Job created successfully",
      data: newJob
    }
  } catch (error) {
    console.error("Error creating job:", error)
    return { isSuccess: false, message: "Failed to create job" }
  }
}

export async function getJobAction(id: string): Promise<ActionState<SelectJob>> {
  try {
    const job = await db.query.jobs.findFirst({
      where: eq(jobsTable.id, id)
    })

    if (!job) {
      return { isSuccess: false, message: "Job not found" }
    }

    return {
      isSuccess: true,
      message: "Job retrieved successfully",
      data: job
    }
  } catch (error) {
    console.error("Error getting job:", error)
    return { isSuccess: false, message: "Failed to get job" }
  }
}

export async function getUserJobsAction(userId: string): Promise<ActionState<SelectJob[]>> {
  try {
    const jobs = await db.query.jobs.findMany({
      where: eq(jobsTable.userId, userId)
    })

    return {
      isSuccess: true,
      message: "Jobs retrieved successfully",
      data: jobs
    }
  } catch (error) {
    console.error("Error getting jobs:", error)
    return { isSuccess: false, message: "Failed to get jobs" }
  }
}

export async function updateJobAction(
  id: string,
  data: Partial<InsertJob>
): Promise<ActionState<SelectJob>> {
  try {
    const [updatedJob] = await db
      .update(jobsTable)
      .set(data)
      .where(eq(jobsTable.id, id))
      .returning()

    return {
      isSuccess: true,
      message: "Job updated successfully",
      data: updatedJob
    }
  } catch (error) {
    console.error("Error updating job:", error)
    return { isSuccess: false, message: "Failed to update job" }
  }
}

export async function deleteJobAction(id: string): Promise<ActionState<void>> {
  try {
    await db.delete(jobsTable).where(eq(jobsTable.id, id))
    return {
      isSuccess: true,
      message: "Job deleted successfully",
      data: undefined
    }
  } catch (error) {
    console.error("Error deleting job:", error)
    return { isSuccess: false, message: "Failed to delete job" }
  }
} 