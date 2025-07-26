-- Table to track Textract jobs for OCR processing
CREATE TABLE IF NOT EXISTS textract_jobs (
    job_id VARCHAR(255) PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES repository_items(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes separately
CREATE INDEX IF NOT EXISTS idx_textract_jobs_item_id ON textract_jobs(item_id);
CREATE INDEX IF NOT EXISTS idx_textract_jobs_created_at ON textract_jobs(created_at);

-- Add new processing status for OCR (if not already added)
DO $$ 
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_processing_status_ocr'
    ) THEN
        ALTER TABLE repository_items 
        DROP CONSTRAINT IF EXISTS repository_items_processing_status_check;
        
        ALTER TABLE repository_items 
        ADD CONSTRAINT check_processing_status_ocr 
        CHECK (processing_status IN ('pending', 'processing', 'processing_ocr', 'processing_embeddings', 'completed', 'embedded', 'failed', 'embedding_failed'));
    END IF;
END $$;