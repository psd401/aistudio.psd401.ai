import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth/server-session"
import { checkUserRoleByCognitoSub, executeSQL } from "@/lib/db/data-api-adapter"
import { validateImportFile, mapModelsForImport, type ExportFormat } from "@/lib/assistant-export-import"
import { v4 as uuidv4 } from "uuid"
import logger from "@/lib/logger"

export async function POST(request: NextRequest) {

  try {
    // Check authentication
    const session = await getServerSession()
    if (!session || !session.sub) {
      return NextResponse.json(
        { isSuccess: false, message: "Unauthorized" },
        { status: 401 }
      )
    }

    // Check if user is admin
    const isAdmin = await checkUserRoleByCognitoSub(session.sub, 'administrator')
    if (!isAdmin) {
      return NextResponse.json(
        { isSuccess: false, message: "Forbidden - Admin access required" },
        { status: 403 }
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
    } catch (error) {
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

    logger.info(`Importing ${importData.assistants.length} assistants`)

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

    const userId = userResult[0].id

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
        const assistantId = uuidv4()

        // Insert assistant
        await executeSQL(`
          INSERT INTO assistant_architects (
            id, name, description, status, image_path, 
            is_parallel, timeout_seconds, user_id, created_at, updated_at
          ) VALUES (
            :id::uuid, :name, :description, :status::tool_status, :imagePath,
            :isParallel, :timeoutSeconds, :userId, NOW(), NOW()
          )
        `, [
          { name: 'id', value: { stringValue: assistantId } },
          { name: 'name', value: { stringValue: assistant.name } },
          { name: 'description', value: { stringValue: assistant.description || '' } },
          { name: 'status', value: { stringValue: 'pending_approval' } }, // Always import as pending
          { name: 'imagePath', value: assistant.image_path ? { stringValue: assistant.image_path } : { isNull: true } },
          { name: 'isParallel', value: { booleanValue: assistant.is_parallel || false } },
          { name: 'timeoutSeconds', value: assistant.timeout_seconds ? { longValue: assistant.timeout_seconds } : { isNull: true } },
          { name: 'userId', value: { stringValue: userId } }
        ])

        // Insert prompts
        for (const prompt of assistant.prompts) {
          const promptId = uuidv4()
          const modelId = modelMap.get(prompt.model_name)

          if (!modelId) {
            logger.warn(`No model mapping found for ${prompt.model_name}, skipping prompt`)
            continue
          }

          await executeSQL(`
            INSERT INTO chain_prompts (
              id, tool_id, name, content, system_context, model_id,
              position, parallel_group, input_mapping, timeout_seconds,
              created_at, updated_at
            ) VALUES (
              :id::uuid, :toolId::uuid, :name, :content, :systemContext, :modelId,
              :position, :parallelGroup, :inputMapping::jsonb, :timeoutSeconds,
              NOW(), NOW()
            )
          `, [
            { name: 'id', value: { stringValue: promptId } },
            { name: 'toolId', value: { stringValue: assistantId } },
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
          const fieldId = uuidv4()

          await executeSQL(`
            INSERT INTO tool_input_fields (
              id, tool_id, name, label, field_type, position, options,
              created_at, updated_at
            ) VALUES (
              :id::uuid, :toolId::uuid, :name, :label, :fieldType::field_type, 
              :position, :options::jsonb, NOW(), NOW()
            )
          `, [
            { name: 'id', value: { stringValue: fieldId } },
            { name: 'toolId', value: { stringValue: assistantId } },
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
        logger.error(`Error importing assistant ${assistant.name}:`, error)
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

    logger.info(`Successfully imported ${successCount} out of ${importData.assistants.length} assistants`)

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
    logger.error('Error importing assistants:', error)

    return NextResponse.json(
      { isSuccess: false, message: 'Failed to import assistants' },
      { status: 500 }
    )
  }
}