#!/usr/bin/env python3
# Debug script for leaderboard functionality

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '.'))

from app.core.database import SessionLocal
from app.models.user import User
from app.models.search import SearchQuery
from app.models.stars import DocumentContribution, ContributionLike, DocumentStar
from app.models.document import Document
from app.models.ingestion import IngestionJob
from sqlalchemy import func, desc, case, and_
from datetime import datetime, timedelta

def debug_leaderboard():
    """Debug the leaderboard query step by step"""
    db = SessionLocal()

    try:
        print("=== DEBUGGING LEADERBOARD QUERY ===")

        # Test simple user query first
        print("\n1. Testing basic user query...")
        users = db.query(User).filter(User.is_active == True).all()
        print(f"Active users: {len(users)}")
        for user in users:
            print(f"  - {user.username} (id: {user.id})")

        # Test each join separately
        print("\n2. Testing individual joins...")

        # DocumentContribution join
        print("  - DocumentContribution join...")
        contrib_query = db.query(
            User.id,
            User.username,
            func.count(DocumentContribution.id).label('contributions_count')
        ).outerjoin(
            DocumentContribution, DocumentContribution.user_id == User.id
        ).filter(
            User.is_active == True
        ).group_by(User.id, User.username)

        contrib_results = contrib_query.all()
        print(f"    Results: {len(contrib_results)}")
        for result in contrib_results:
            print(f"      {result.username}: {result.contributions_count} contributions")

        # ContributionLike join
        print("  - ContributionLike join...")
        likes_query = db.query(
            User.id,
            User.username,
            func.count(ContributionLike.id).label('likes_received')
        ).outerjoin(
            DocumentContribution, DocumentContribution.user_id == User.id
        ).outerjoin(
            ContributionLike, ContributionLike.contribution_id == DocumentContribution.id
        ).filter(
            User.is_active == True
        ).group_by(User.id, User.username)

        likes_results = likes_query.all()
        print(f"    Results: {len(likes_results)}")
        for result in likes_results:
            print(f"      {result.username}: {result.likes_received} likes")

        # SearchQuery join
        print("  - SearchQuery join...")
        search_query = db.query(
            User.id,
            User.username,
            func.count(SearchQuery.id).label('searches_count')
        ).outerjoin(
            SearchQuery, SearchQuery.user_id == User.id
        ).filter(
            User.is_active == True
        ).group_by(User.id, User.username)

        search_results = search_query.all()
        print(f"    Results: {len(search_results)}")
        for result in search_results:
            print(f"      {result.username}: {result.searches_count} searches")

        # DocumentStar join
        print("  - DocumentStar join...")
        star_query = db.query(
            User.id,
            User.username,
            func.count(DocumentStar.id).label('documents_starred')
        ).outerjoin(
            DocumentStar, DocumentStar.user_id == User.id
        ).filter(
            User.is_active == True
        ).group_by(User.id, User.username)

        star_results = star_query.all()
        print(f"    Results: {len(star_results)}")
        for result in star_results:
            print(f"      {result.username}: {result.documents_starred} stars")

        # IngestionJob and Document join
        print("  - IngestionJob and Document join...")
        upload_query = db.query(
            User.id,
            User.username,
            func.count(Document.id).label('documents_uploaded')
        ).outerjoin(
            IngestionJob, IngestionJob.user_id == User.id
        ).outerjoin(
            Document, Document.ingestion_job_id == IngestionJob.id
        ).filter(
            User.is_active == True,
            IngestionJob.status == 'completed'
        ).group_by(User.id, User.username)

        upload_results = upload_query.all()
        print(f"    Results: {len(upload_results)}")
        for result in upload_results:
            print(f"      {result.username}: {result.documents_uploaded} uploads")

        print("\n3. Testing the full complex query...")

        # Full query with proper CASE handling
        try:
            full_query = db.query(
                User.id,
                User.username,
                User.full_name,
                User.department,
                User.created_at,
                User.last_login,
                # Count contributions
                func.coalesce(
                    func.count(
                        case(
                            (DocumentContribution.user_id == User.id, DocumentContribution.id),
                            else_=None
                        )
                    ), 0
                ).label('contributions_count'),
                # Count likes received
                func.coalesce(
                    func.count(
                        case(
                            (and_(
                                ContributionLike.contribution_id == DocumentContribution.id,
                                DocumentContribution.user_id == User.id
                            ), ContributionLike.id),
                            else_=None
                        )
                    ), 0
                ).label('likes_received'),
                # Count searches
                func.coalesce(
                    func.count(
                        case(
                            (SearchQuery.user_id == User.id, SearchQuery.id),
                            else_=None
                        )
                    ), 0
                ).label('searches_count'),
                # Count starred documents
                func.coalesce(
                    func.count(
                        case(
                            (DocumentStar.user_id == User.id, DocumentStar.id),
                            else_=None
                        )
                    ), 0
                ).label('documents_starred'),
                # Count documents uploaded
                func.coalesce(
                    func.count(
                        case(
                            (and_(
                                IngestionJob.user_id == User.id,
                                IngestionJob.status == 'completed'
                            ), Document.id),
                            else_=None
                        )
                    ), 0
                ).label('documents_uploaded')
            ).outerjoin(
                DocumentContribution, DocumentContribution.user_id == User.id
            ).outerjoin(
                ContributionLike, ContributionLike.contribution_id == DocumentContribution.id
            ).outerjoin(
                SearchQuery, SearchQuery.user_id == User.id
            ).outerjoin(
                DocumentStar, DocumentStar.user_id == User.id
            ).outerjoin(
                IngestionJob, IngestionJob.user_id == User.id
            ).outerjoin(
                Document, Document.ingestion_job_id == IngestionJob.id
            ).filter(
                User.is_active == True
            ).group_by(
                User.id, User.username, User.full_name, User.department,
                User.created_at, User.last_login
            )

            results = full_query.all()
            print(f"Full query results: {len(results)}")

            for result in results:
                total_score = (
                    result.contributions_count * 10 +
                    result.likes_received * 5 +
                    result.searches_count * 1 +
                    result.documents_starred * 2 +
                    result.documents_uploaded * 15
                )
                print(f"  {result.username}: {total_score} points")
                print(f"    - Contributions: {result.contributions_count}")
                print(f"    - Likes: {result.likes_received}")
                print(f"    - Searches: {result.searches_count}")
                print(f"    - Stars: {result.documents_starred}")
                print(f"    - Uploads: {result.documents_uploaded}")

        except Exception as e:
            print(f"Full query failed: {e}")
            import traceback
            traceback.print_exc()

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    debug_leaderboard()