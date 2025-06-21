"use server"

import { InsertJob, SelectJob, jobsTable } from "@/db/schema"
import { ActionState } from "@/types"
import { eq } from "drizzle-orm"
import logger from "@/lib/logger"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { v4 as uuidv4 } from "uuid";

export async function createJobAction(
  job: Omit<InsertJob, "id" | "createdAt" | "updatedAt">
): Promise<ActionState<SelectJob>> {
  try {
    if (!job.userId) {
      return { isSuccess: false, message: "A userId must be provided to create a job." };
    }

    const newJobId = uuidv4();
    const result = await executeSQL(`
      INSERT INTO jobs (id, user_id, status, type, input, output, error, created_at, updated_at)
      VALUES (:id::uuid, :userId, :status::job_status, :type, :input, :output, :error, NOW(), NOW())
      RETURNING *
    `, [
      { name: 'id', value: { stringValue: newJobId } },
      { name: 'userId', value: { stringValue: job.userId } },
      { name: 'status', value: { stringValue: job.status ?? 'pending' } },
      { name: 'type', value: { stringValue: job.type } },
      { name: 'input', value: { stringValue: job.input } },
      { name: 'output', value: job.output ? { stringValue: job.output } : { isNull: true } },
      { name: 'error', value: job.error ? { stringValue: job.error } : { isNull: true } },
    ]);
    
    const [newJob] = result;
    if (!newJob) {
      throw new Error("Failed to create job: no record returned.");
    }
    
    const transformedJob = {
        id: newJob.id,
        userId: newJob.user_id,
        status: newJob.status,
        type: newJob.type,
        input: newJob.input,
        output: newJob.output,
        error: newJob.error,
        createdAt: newJob.created_at,
        updatedAt: newJob.updated_at
    };

    return {
      isSuccess: true,
      message: "Job created successfully",
      data: transformedJob as SelectJob
    }
  } catch (error) {
    logger.error("Error creating job", { error })
    return { isSuccess: false, message: "Failed to create job" }
  }
}

export async function getJobAction(id: string): Promise<ActionState<SelectJob>> {
  try {
    const result = await executeSQL(
      'SELECT * FROM jobs WHERE id = :id::uuid',
      [{ name: 'id', value: { stringValue: id } }]
    );
    const job = result[0];

    if (!job) {
      return { isSuccess: false, message: "Job not found" }
    }
    
    const transformedJob = {
        id: job.id,
        userId: job.user_id,
        status: job.status,
        type: job.type,
        input: job.input,
        output: job.output,
        error: job.error,
        createdAt: job.created_at,
        updatedAt: job.updated_at
    };

    return {
      isSuccess: true,
      message: "Job retrieved successfully",
      data: transformedJob as SelectJob
    }
  } catch (error) {
    logger.error("Error getting job", { error })
    return { isSuccess: false, message: "Failed to get job" }
  }
}

export async function getUserJobsAction(userId: string): Promise<ActionState<SelectJob[]>> {
  try {
    const result = await executeSQL(
      'SELECT * FROM jobs WHERE user_id = :userId',
      [{ name: 'userId', value: { stringValue: userId } }]
    );

    const transformedJobs = result.map((job: any) => ({
        id: job.id,
        userId: job.user_id,
        status: job.status,
        type: job.type,
        input: job.input,
        output: job.output,
        error: job.error,
        createdAt: job.created_at,
        updatedAt: job.updated_at
    }));

    return {
      isSuccess: true,
      message: "Jobs retrieved successfully",
      data: transformedJobs as SelectJob[]
    }
  } catch (error) {
    logger.error("Error getting jobs", { error })
    return { isSuccess: false, message: "Failed to get jobs" }
  }
}

export async function updateJobAction(
  id: string,
  data: Partial<Omit<InsertJob, 'id' | 'userId'>>
): Promise<ActionState<SelectJob>> {
  try {
    const setClauses = Object.entries(data)
      .map(([key, value]) => {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (dbKey === 'status') {
          return `${dbKey} = :${key}::job_status`;
        }
        return `${dbKey} = :${key}`;
      })
      .join(', ');

    const parameters = Object.entries(data).map(([key, value]) => ({
      name: key,
      value: value === null || value === undefined ? { isNull: true } : { stringValue: String(value) }
    }));
    parameters.push({ name: 'id', value: { stringValue: id } });
    
    const result = await executeSQL(
      `UPDATE jobs SET ${setClauses}, updated_at = NOW() WHERE id = :id::uuid RETURNING *`,
      parameters
    );

    const [updatedJob] = result;

    if (!updatedJob) {
        throw new Error("Failed to update job or job not found.");
    }

    const transformedJob = {
        id: updatedJob.id,
        userId: updatedJob.user_id,
        status: updatedJob.status,
        type: updatedJob.type,
        input: updatedJob.input,
        output: updatedJob.output,
        error: updatedJob.error,
        createdAt: updatedJob.created_at,
        updatedAt: updatedJob.updated_at
    };

    return {
      isSuccess: true,
      message: "Job updated successfully",
      data: transformedJob as SelectJob
    }
  } catch (error) {
    logger.error("Error updating job", { error })
    return { isSuccess: false, message: "Failed to update job" }
  }
}

export async function deleteJobAction(id: string): Promise<ActionState<void>> {
  try {
    await executeSQL(
      'DELETE FROM jobs WHERE id = :id::uuid',
      [{ name: 'id', value: { stringValue: id } }]
    );
    return {
      isSuccess: true,
      message: "Job deleted successfully",
      data: undefined
    }
  } catch (error) {
    logger.error("Error deleting job", { error })
    return { isSuccess: false, message: "Failed to delete job" }
  }
} 