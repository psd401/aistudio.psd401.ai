import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-check"
import { getServerSession } from "@/lib/auth/server-session"
import { executeSQL } from "@/lib/db/data-api-adapter"
import { validateImportFile, mapModelsForImport, type ExportFormat } from "@/lib/assistant-export-import"
// UUID import removed - using auto-increment IDs
import { createLogger, generateRequestId, startTimer } from "@/lib/logger"

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const timer = startTimer("api.admin.assistants.import");
  const log = createLogger({ requestId, route: "api.admin.assistants.import" });
  
  log.info("POST /api/admin/assistants/import - Importing assistants");

  try {
    // Check admin authorization
    const authError = await requireAdmin();
    if (authError) {
      log.warn("Unauthorized admin access attempt");
      timer({ status: "error", reason: "unauthorized" });
      return authError;
    }

    // Get session for user ID
    const session = await getServerSession();
    if (!session || !session.sub) {
      return NextResponse.json(
        { isSuccess: false, message: "Session error" },
        { status: 500 }
      )
    }

    // Parse form data to get the file
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { isSuccess: false, message: "No file provided" },
        { status: 400 }
      )
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { isSuccess: false, message: "File too large. Maximum size is 10MB" },
        { status: 400 }
      )
    }

    // Read and parse file
    const fileContent = await file.text()
    let importData: ExportFormat

    try {
      importData = JSON.parse(fileContent)
    } catch {
      return NextResponse.json(
        { isSuccess: false, message: "Invalid JSON file" },
        { status: 400 }
      )
    }

    // Validate file structure
    const validation = validateImportFile(importData)
    if (!validation.valid) {
      return NextResponse.json(
        { isSuccess: false, message: validation.error },
        { status: 400 }
      )
    }

    log.info("Starting import", { assistantCount: importData.assistants.length })

    // Get user ID from Cognito sub
    const userResult = await executeSQL(
      "SELECT id FROM users WHERE cognito_sub = :sub LIMIT 1",
      [{ name: 'sub', value: { stringValue: session.sub } }]
    )

    if (!userResult || userResult.length === 0) {
      return NextResponse.json(
        { isSuccess: false, message: "User not found" },
        { status: 404 }
      )
    }

    const userId = userResult[0].id // This is now an integer

    // Collect all unique model names for mapping
    const modelNames = new Set<string>()
    for (const assistant of importData.assistants) {
      for (const prompt of assistant.prompts) {
        modelNames.add(prompt.model_name)
      }
    }

    // Map models
    const modelMap = await mapModelsForImport(Array.from(modelNames))

    const importResults = []

    // Import each assistant
    for (const assistant of importData.assistants) {
      try {
        // Insert assistant and get the generated ID
        const assistantResult = await executeSQL(`
          INSERT INTO assistant_architects (
            name, description, status, image_path, 
            is_parallel, timeout_seconds, user_id, created_at, updated_at
          ) VALUES (
            :name, :description, :status::tool_status, :imagePath,
            :isParallel, :timeoutSeconds, :userId, NOW(), NOW()
          )
          RETURNING id
        `, [
          { name: 'name', value: { stringValue: assistant.name } },
          { name: 'description', value: { stringValue: assistant.description || '' } },
          { name: 'status', value: { stringValue: 'pending_approval' } }, // Always import as pending
          { name: 'imagePath', value: assistant.image_path ? { stringValue: assistant.image_path } : { isNull: true } },
          { name: 'isParallel', value: { booleanValue: assistant.is_parallel || false } },
          { name: 'timeoutSeconds', value: assistant.timeout_seconds ? { longValue: assistant.timeout_seconds } : { isNull: true } },
          { name: 'userId', value: { longValue: Number(userId) } }
        ])

        const assistantId = assistantResult[0].id

        // Insert prompts
        for (const prompt of assistant.prompts) {
          const modelId = modelMap.get(prompt.model_name)

          if (!modelId) {
            log.warn(`No model mapping found for ${prompt.model_name}, skipping prompt`)
            continue
          }

          await executeSQL(`
            INSERT INTO chain_prompts (
              assistant_architect_id, name, content, system_context, model_id,
              position, parallel_group, input_mapping, timeout_seconds,
              created_at, updated_at
            ) VALUES (
              :assistantId, :name, :content, :systemContext, :modelId,
              :position, :parallelGroup, :inputMapping::jsonb, :timeoutSeconds,
              NOW(), NOW()
            )
          `, [
            { name: 'assistantId', value: { longValue: Number(assistantId) } },
            { name: 'name', value: { stringValue: prompt.name } },
            { name: 'content', value: { stringValue: prompt.content } },
            { name: 'systemContext', value: prompt.system_context ? { stringValue: prompt.system_context } : { isNull: true } },
            { name: 'modelId', value: { longValue: modelId } },
            { name: 'position', value: { longValue: prompt.position } },
            { name: 'parallelGroup', value: prompt.parallel_group ? { longValue: prompt.parallel_group } : { isNull: true } },
            { name: 'inputMapping', value: prompt.input_mapping ? { stringValue: JSON.stringify(prompt.input_mapping) } : { stringValue: '{}' } },
            { name: 'timeoutSeconds', value: prompt.timeout_seconds ? { longValue: prompt.timeout_seconds } : { isNull: true } }
          ])
        }

        // Insert input fields
        for (const field of assistant.input_fields) {
          await executeSQL(`
            INSERT INTO tool_input_fields (
              assistant_architect_id, name, label, field_type, position, options,
              created_at, updated_at
            ) VALUES (
              :assistantId, :name, :label, :fieldType::field_type, 
              :position, :options::jsonb, NOW(), NOW()
            )
          `, [
            { name: 'assistantId', value: { longValue: Number(assistantId) } },
            { name: 'name', value: { stringValue: field.name } },
            { name: 'label', value: { stringValue: field.label } },
            { name: 'fieldType', value: { stringValue: field.field_type } },
            { name: 'position', value: { longValue: field.position } },
            { name: 'options', value: field.options ? { stringValue: JSON.stringify(field.options) } : { stringValue: '{}' } }
          ])
        }

        importResults.push({
          name: assistant.name,
          id: assistantId,
          status: 'success'
        })

      } catch (error) {
        log.error(`Error importing assistant ${assistant.name}:`, error)
        importResults.push({
          name: assistant.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Check if any imports succeeded
    const successCount = importResults.filter(r => r.status === 'success').length
    
    if (successCount === 0) {
      return NextResponse.json(
        { 
          isSuccess: false, 
          message: "Failed to import any assistants",
          details: importResults
        },
        { status: 500 }
      )
    }

    log.info(`Successfully imported ${successCount} out of ${importData.assistants.length} assistants`)

    return NextResponse.json({
      isSuccess: true,
      message: `Successfully imported ${successCount} assistant(s)`,
      data: {
        total: importData.assistants.length,
        successful: successCount,
        failed: importData.assistants.length - successCount,
        results: importResults,
        modelMappings: Array.from(modelMap.entries()).map(([name, id]) => ({ modelName: name, mappedToId: id }))
      }
    })

  } catch (error) {
    log.error('Error importing assistants:', error)

    return NextResponse.json(
      { isSuccess: false, message: 'Failed to import assistants' },
      { status: 500 }
    )
  }
}