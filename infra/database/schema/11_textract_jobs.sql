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

-- The repository_items table already has the correct processing_status constraint
-- that includes all the necessary statuses, so no modification needed