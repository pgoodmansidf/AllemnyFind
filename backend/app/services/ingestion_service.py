"""Custom ingestion pipeline using local Ollama for embeddings and
agentic-style chunking.

This module implements a simple ingestion service that leverages the
existing `DocumentProcessor` and `FileScanner` utilities to discover and
extract documents, chunks them while preserving tabular data, generates
embeddings using a local Ollama model, and persists the results to the
database.  It is designed to be a drop-in replacement for the previous
ingestion logic, but relies solely on local services (Ollama for
embeddings and PostgreSQL for storage) and does not call external
services such as OpenAI or Groq for embedding generation.

Key features:

* Uses a custom chunker that preserves table structures.  Tables are
  detected by the presence of `|` or tab characters and kept intact in a
  single chunk.  The detected tables are also stored in the `tables`
  column of the `document_chunks` table.
* Extracts simple metadata from each document such as SAU identifiers,
  city names, product keywords and derives an industry/sector.  This
  metadata is stored in the `doc_metadata` field of the `documents`
  table for later use by agents.
* Computes embeddings for each chunk using the local Ollama
  `/api/embeddings` REST endpoint.  The selected model is taken from
  the ingestion job's `embedding_model` field.
* Updates the ingestion job progress and statistics in real time.

Note: This service assumes that your backend exposes API endpoints for
Redis status/start if you choose to enable Redis integration via the
settings panel.  Those endpoints are not implemented here.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests
from sqlalchemy.orm import Session

from app.models.document import Document, DocumentChunk
import { IngestionJob } from '@/services/ingestionApi';
# from app.services.ingestion import IngestionJob

from document_processor import document_processor
from file_scanner import file_scanner
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
    """Represents a chunk of text along with any tables detected."""

    content: str
    tables: Optional[List[str]] = None


class DocumentChunker:
    """Split documents into manageable chunks while keeping tables intact.

    This chunker uses a simple heuristic: it splits the input text on
    paragraph boundaries (double newlines), aggregates paragraphs into
    chunks up to a configurable character limit (`chunk_size`), and
    applies an overlap of `chunk_overlap` characters between adjacent
    chunks to preserve context.  Paragraphs that contain table-like
    structures (detected by the presence of `|` or tab characters) are
    included wholly within a single chunk and recorded separately in
    the chunk's `tables` attribute.
    """

    def __init__(self, chunk_size: int = 500, chunk_overlap: int = 100) -> None:
        # Work in characters rather than tokens for simplicity.  Chunking by
        # characters is deterministic and avoids tokenization dependencies.
        self.chunk_size = max(chunk_size, 100)
        self.chunk_overlap = max(min(chunk_overlap, chunk_size), 0)

    def split(self, text: str) -> List[Chunk]:
        """Split the provided text into chunks.

        Args:
            text: The full document text to be chunked.

        Returns:
            A list of `Chunk` objects.  Each chunk contains a piece of
            the original text and any associated tables.
        """
        if not text:
            return []

        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks: List[Chunk] = []
        current: List[str] = []
        current_len = 0
        current_tables: List[str] = []

        for para in paragraphs:
            is_table = ('|' in para) or ('\t' in para)
            para_len = len(para) + 2  # account for double newline joiner
            # If adding this paragraph exceeds the limit and we have content
            if current and current_len + para_len > self.chunk_size:
                chunk_text = "\n\n".join(current)
                chunks.append(Chunk(content=chunk_text, tables=current_tables or None))
                # Prepare next chunk with overlap
                overlap_text = chunk_text[-self.chunk_overlap :] if self.chunk_overlap > 0 else ""
                current = [overlap_text.strip(), para]
                current_len = len(overlap_text) + para_len
                current_tables = [para] if is_table else []
            else:
                current.append(para)
                current_len += para_len
                if is_table:
                    current_tables.append(para)

        # Append any remaining text
        if current:
            chunk_text = "\n\n".join([c for c in current if c])
            chunks.append(Chunk(content=chunk_text, tables=current_tables or None))
        return chunks


def get_embedding(text: str, model: str) -> Optional[List[float]]:
    """Call the local Ollama embeddings endpoint to compute embeddings.

    Args:
        text: The text to embed.
        model: The Ollama embedding model to use (e.g. "nomic-embed-text").

    Returns:
        A list of floats representing the embedding vector, or None if
        embedding generation fails.
    """
    url = "http://localhost:11434/api/embeddings"
    payload = {"model": model, "prompt": text}
    try:
        response = requests.post(url, json=payload, timeout=60)
        response.raise_for_status()
        data = response.json()
        # The response format for Ollama embeddings is documented as
        # `{"embedding": [float, ...]}` but some versions may wrap it
        # differently.  Attempt to extract the vector in a robust way.
        if isinstance(data, dict):
            if "embedding" in data and isinstance(data["embedding"], list):
                return data["embedding"]
            # Some versions return a list of embeddings
            if "data" in data and isinstance(data["data"], list) and data["data"]:
                maybe = data["data"][0]
                if isinstance(maybe, dict) and "embedding" in maybe:
                    return maybe["embedding"]
        elif isinstance(data, list) and data:
            # If a raw list is returned assume it's the vector
            if all(isinstance(x, (int, float)) for x in data):
                return data
        logger.warning(f"Unexpected embedding response format: {data}")
    except Exception as exc:
        logger.warning(f"Embedding request failed: {exc}")
    return None


def extract_metadata(text: str) -> Dict[str, Optional[str]]:
    """Extract metadata such as SAU numbers, city names and product keywords.

    This function uses simple pattern matching to find a numeric string
    starting with "SAU" (e.g. "SAU12345" or "SAU-12345"), searches for
    known city names, and looks for keywords that indicate the main
    product/industry.  The industry and sector are derived from the
    product when possible.  If no data is found, fields are set to None.

    Args:
        text: The full document text.

    Returns:
        A dictionary with keys: sau_number, city, product, industry,
        sector.  Values may be None if not found.
    """
    sau_match = re.search(r"SAU[-]?\d{5}", text, re.IGNORECASE)
    sau_number = sau_match.group().upper() if sau_match else None

    # List of cities – extend this list with cities relevant to your
    # documents.  This simple check is case-insensitive.
    cities = [
        "Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Tabuk",
        "Buraydah", "Khamis Mushait", "Hofuf", "Taif",
    ]
    city = None
    lower_text = text.lower()
    for c in cities:
        if c.lower() in lower_text:
            city = c
            break

    # Keywords to determine main product/industry.  Feel free to expand
    # this mapping with domain-specific terms.
    product_keywords = [
        "oil", "gas", "petroleum", "chemicals", "plastic", "food",
        "beverage", "software", "technology", "bank", "finance",
        "pharmaceutical", "construction", "agriculture", "automotive",
    ]
    product = None
    for kw in product_keywords:
        if kw in lower_text:
            product = kw
            break

    # Map products to industry and sector.  This mapping is simplified and
    # may not cover all cases; update it to suit your use case.
    industry_sector_map: Dict[str, Tuple[str, str]] = {
        "oil": ("Oil & Gas", "Energy"),
        "gas": ("Oil & Gas", "Energy"),
        "petroleum": ("Oil & Gas", "Energy"),
        "chemicals": ("Chemicals", "Materials"),
        "plastic": ("Chemicals", "Materials"),
        "food": ("Food Products", "Consumer Staples"),
        "beverage": ("Food Products", "Consumer Staples"),
        "software": ("Software", "Information Technology"),
        "technology": ("Technology", "Information Technology"),
        "bank": ("Banking", "Financials"),
        "finance": ("Financial Services", "Financials"),
        "pharmaceutical": ("Pharmaceuticals", "Health Care"),
        "construction": ("Construction", "Industrials"),
        "agriculture": ("Agriculture", "Consumer Staples"),
        "automotive": ("Automotive", "Consumer Discretionary"),
    }
    industry = None
    sector = None
    if product and product in industry_sector_map:
        industry, sector = industry_sector_map[product]

    return {
        "sau_number": sau_number,
        "city": city,
        "product": product,
        "industry": industry,
        "sector": sector,
    }


class IngestionService:
    """Service class responsible for executing ingestion jobs."""

    def __init__(self, session_factory: SessionLocal = SessionLocal) -> None:
        self.session_factory = session_factory

    def run_job(self, job_id: str) -> None:
        """Run an ingestion job by its ID.

        This method scans the source directory, extracts documents,
        chunks them, computes embeddings, stores them in the database,
        and updates the job status and progress.

        Args:
            job_id: The UUID of the job to run as a string.
        """
        session: Session = self.session_factory()
        try:
            job: Optional[IngestionJob] = session.query(IngestionJob).filter(IngestionJob.id == job_id).first()
            if not job:
                logger.error(f"Ingestion job {job_id} not found")
                return
            if job.status not in ("pending", "failed"):
                logger.info(f"Job {job_id} is already in status {job.status}, skipping")
                return

            job.status = "running"
            job.started_at = datetime.utcnow()
            job.progress = 0.0
            session.commit()

            # Scan the directory for files
            scan_result = file_scanner.scan_directory(job.source_path, recursive=True)
            files = scan_result.get("files", [])
            job.total_files = len(files)
            session.commit()

            if not files:
                job.status = "failed"
                job.error_message = "No supported files found in source directory"
                job.completed_at = datetime.utcnow()
                session.commit()
                return

            # Instantiate the chunker with the job's settings
            chunker = DocumentChunker(chunk_size=job.chunk_size, chunk_overlap=job.chunk_overlap)

            processed_count = 0
            for file_info in files:
                try:
                    # Extract content
                    extract = document_processor.extract_content(file_info["path"])
                    content = extract.get("content", "")
                    if not content:
                        job.skipped_files += 1
                        session.commit()
                        continue

                    # Compute content hash for deduplication
                    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

                    # Create Document record
                    doc = Document(
                        filename=file_info["filename"],
                        original_path=file_info["path"],
                        file_type=file_info["extension"],
                        file_size=file_info["size"],
                        mime_type=file_info.get("mime_type"),
                        encoding=None,
                        content=content,
                        content_hash=content_hash,
                        summary=None,
                        main_topics=None,
                        product_tags=None,
                        groq_response=None,
                        doc_metadata=extract_metadata(content),
                        collection_name=job.main_tag,
                        is_public=False,
                        status="active",
                        ingestion_job_id=job.id,
                        processing_status="content_extracted",
                        total_chunks=0,
                    )
                    session.add(doc)
                    session.commit()  # commit to assign document id

                    # Chunk the document
                    chunks = chunker.split(content)
                    doc.total_chunks = len(chunks)
                    # Update processing status to completed after chunking
                    doc.processing_status = "completed"
                    session.commit()

                    # For each chunk generate embedding and store
                    for idx, chunk in enumerate(chunks):
                        # Generate embedding
                        embedding_vector = get_embedding(chunk.content, job.embedding_model)
                        # Build metadata for the chunk
                        chunk_meta: Dict[str, Optional[str]] = {
                            "has_table": bool(chunk.tables),
                            "num_tables": len(chunk.tables) if chunk.tables else 0,
                        }
                        # Compute chunk hash
                        chunk_hash = hashlib.sha256(chunk.content.encode("utf-8")).hexdigest()
                        document_chunk = DocumentChunk(
                            document_id=doc.id,
                            chunk_index=idx,
                            content=chunk.content,
                            content_hash=chunk_hash,
                            token_count=len(chunk.content.split()),
                            embedding=embedding_vector,
                            embedding_model=job.embedding_model,
                            start_char=None,
                            end_char=None,
                            page_number=None,
                            chunk_metadata=chunk_meta,
                            section_title=None,
                            subsection_title=None,
                            tables=chunk.tables,
                        )
                        session.add(document_chunk)
                    session.commit()

                    processed_count += 1
                    job.processed_files = processed_count
                    job.progress = (processed_count / job.total_files) * 100.0
                    session.commit()
                except Exception as file_exc:
                    logger.error(f"Failed to process file {file_info['path']}: {file_exc}")
                    job.failed_files += 1
                    session.commit()

            # Mark job as completed
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            job.error_message = None
            job.progress = 100.0
            session.commit()
        except Exception as exc:
            # Catch any unexpected errors and mark the job as failed
            logger.exception(f"Ingestion job {job_id} encountered an error: {exc}")
            session.rollback()
            try:
                job = session.query(IngestionJob).filter(IngestionJob.id == job_id).first()
                if job:
                    job.status = "failed"
                    job.error_message = str(exc)
                    job.completed_at = datetime.utcnow()
                    session.commit()
            except Exception:
                pass
        finally:
            session.close()