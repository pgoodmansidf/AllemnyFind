-- Add new columns for enhanced table support
ALTER TABLE document_chunks 
ADD COLUMN structured_data JSONB,
ADD COLUMN embedding_strategy VARCHAR(50),
ADD COLUMN search_keywords TEXT[];

-- Add indexes for better performance
CREATE INDEX idx_chunks_embedding_strategy ON document_chunks(embedding_strategy);
CREATE INDEX idx_chunks_keywords ON document_chunks USING GIN(search_keywords);