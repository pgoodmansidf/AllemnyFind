-- Comments table
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_edited BOOLEAN DEFAULT FALSE
);

-- Likes table
CREATE TABLE comment_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

-- Search analytics table
CREATE TABLE search_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    result_count INTEGER DEFAULT 0,
    clicked_result BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Document views table
CREATE TABLE document_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_comments_document_id ON comments(document_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_comment_id);
CREATE INDEX idx_comment_likes_comment_id ON comment_likes(comment_id);
CREATE INDEX idx_search_analytics_created_at ON search_analytics(created_at);
CREATE INDEX idx_document_views_document_id ON document_views(document_id);
CREATE INDEX idx_document_views_viewed_at ON document_views(viewed_at);