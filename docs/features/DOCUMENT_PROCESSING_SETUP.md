# Document Processing Setup Instructions

## Required Settings Configuration

To enable Vision LLM processing for PDFs in the unified document processing system, you need to create the following setting in your database:

### 1. PDF Processing Model Setting

**Setting Key**: `PDF_PROCESSING_MODEL_ID`
**Setting Value**: The ID of the AI model you want to use for PDF Vision processing (e.g., `20`)

#### How to Add the Setting:

```sql
-- Add the PDF processing model setting to the settings table
INSERT INTO settings (key, value, description, created_at, updated_at)
VALUES (
  'PDF_PROCESSING_MODEL_ID',
  '20',  -- Replace with your desired model ID
  'Model ID for PDF Vision processing in document processor. References ai_models.id',
  NOW(),
  NOW()
);
```

#### Or via the Admin Interface:
1. Go to your admin settings interface
2. Add a new setting:
   - **Key**: `PDF_PROCESSING_MODEL_ID` 
   - **Value**: `20` (or your preferred model ID)
   - **Description**: `Model ID for PDF Vision processing in document processor`

### 2. Model Requirements

The model specified by `PDF_PROCESSING_MODEL_ID` must:
- Exist in the `ai_models` table
- Have `active = true`
- Support vision/file processing capabilities
- Be compatible with PDF file inputs

### 3. How It Works

When the document processor encounters a PDF that needs Vision LLM processing:

1. **Settings Lookup**: Queries `getSetting('PDF_PROCESSING_MODEL_ID')` 
2. **Model Retrieval**: Looks up the model in `ai_models` table using the setting value
3. **Vision Processing**: Uses `generateCompletion()` with the configured model
4. **No Hardcoding**: You can change the model anytime by updating the setting

### 4. Benefits of This Approach

✅ **Centralized Configuration**: Change the model in one place (settings table)
✅ **No Code Changes**: Switch models without deploying new code  
✅ **Environment Specific**: Different models for dev/staging/prod via settings
✅ **Cache Optimized**: Settings manager handles caching automatically
✅ **Error Handling**: Clear error messages when setting is missing

### 5. Troubleshooting

**Error: "PDF_PROCESSING_MODEL_ID setting not configured"**
- Solution: Add the setting as described above

**Error: "Active model with ID X not found in database"**  
- Solution: Ensure the model ID exists in `ai_models` and is active

**Error: "Invalid PDF_PROCESSING_MODEL_ID setting value"**
- Solution: Ensure the setting value is a valid integer

## Usage

Once configured, the document processor will automatically use this setting when:
- Processing PDFs via the unified document processing API
- PDF text extraction fails with pdf-parse and Textract
- `convertToMarkdown` option is enabled (triggers Vision LLM fallback)

The processor will use your configured model to extract text and generate markdown from PDF files using vision capabilities.