-- Table to track Textract usage for staying within free tier
CREATE TABLE IF NOT EXISTS textract_usage (
    month DATE PRIMARY KEY,
    page_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_textract_usage_month ON textract_usage(month);