"""add_innovate_tables_only

Revision ID: innovate_tables_only
Revises: e634aca456b9
Create Date: 2025-09-17 12:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'innovate_tables_only'
down_revision: Union[str, Sequence[str], None] = 'e634aca456b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add innovate tables."""
    # Create suggestions table
    op.create_table('suggestions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('category', sa.Enum('FEATURE', 'IMPROVEMENT', 'BUG_FIX', 'UI_UX', 'PERFORMANCE', 'INTEGRATION', 'OTHER', name='suggestioncategory'), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'IMPLEMENTED', name='suggestionstatus'), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('admin_id', sa.Integer(), nullable=True),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('implemented_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('upvotes_count', sa.Integer(), nullable=True),
        sa.Column('downvotes_count', sa.Integer(), nullable=True),
        sa.Column('total_score', sa.Integer(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=True),
        sa.Column('is_featured', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['admin_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_suggestions_id'), 'suggestions', ['id'], unique=False)
    op.create_index(op.f('ix_suggestions_title'), 'suggestions', ['title'], unique=False)

    # Create suggestion_votes table
    op.create_table('suggestion_votes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('suggestion_id', sa.Integer(), nullable=False),
        sa.Column('vote_type', sa.Enum('UPVOTE', 'DOWNVOTE', name='votetype'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['suggestion_id'], ['suggestions.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_user_suggestion_unique', 'suggestion_votes', ['user_id', 'suggestion_id'], unique=True)
    op.create_index(op.f('ix_suggestion_votes_id'), 'suggestion_votes', ['id'], unique=False)

    # Create suggestion_comments table
    op.create_table('suggestion_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('suggestion_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_admin_response', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['suggestion_id'], ['suggestions.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_suggestion_comments_id'), 'suggestion_comments', ['id'], unique=False)


def downgrade() -> None:
    """Remove innovate tables."""
    op.drop_index(op.f('ix_suggestion_comments_id'), table_name='suggestion_comments')
    op.drop_table('suggestion_comments')
    op.drop_index(op.f('ix_suggestion_votes_id'), table_name='suggestion_votes')
    op.drop_index('idx_user_suggestion_unique', table_name='suggestion_votes')
    op.drop_table('suggestion_votes')
    op.drop_index(op.f('ix_suggestions_title'), table_name='suggestions')
    op.drop_index(op.f('ix_suggestions_id'), table_name='suggestions')
    op.drop_table('suggestions')

    # Drop enums
    sa.Enum(name='votetype').drop(op.get_bind())
    sa.Enum(name='suggestionstatus').drop(op.get_bind())
    sa.Enum(name='suggestioncategory').drop(op.get_bind())