# ============================================================
# utils/text_search.py
# Text similarity search using multiple strategies:
#   1. TF-IDF + cosine similarity (fast, no GPU needed)
#   2. rapidfuzz token-based fuzzy matching
#   3. Optional: sentence-transformers semantic similarity
# ============================================================

from __future__ import annotations

import logging
import os
import re
import string
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional imports – gracefully degrade
# ---------------------------------------------------------------------------
try:
    from rapidfuzz import fuzz
    from rapidfuzz import process as rf_process

    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    RAPIDFUZZ_AVAILABLE = False
    logger.warning("rapidfuzz not installed – fuzzy text matching disabled.")

try:
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn not installed – TF-IDF matching disabled.")

try:
    from sentence_transformers import SentenceTransformer

    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    logger.warning("sentence-transformers not installed – semantic search disabled.")

# ---------------------------------------------------------------------------
# Module-level singleton for the sentence-transformer model
# (loaded lazily so startup is fast)
# ---------------------------------------------------------------------------
_sentence_model: Any = None

# Read semantic search settings from environment (set in .env)
_SEMANTIC_ENABLED = os.environ.get("SEMANTIC_SEARCH_ENABLED", "true").lower() not in (
    "false",
    "0",
    "no",
    "off",
)
_SENTENCE_MODEL_NAME = os.environ.get("SEMANTIC_MODEL_NAME", "all-MiniLM-L6-v2").strip()
_SEMANTIC_SCORE_WEIGHT = float(os.environ.get("SEMANTIC_SCORE_WEIGHT", "0.6"))


def _get_sentence_model() -> Any:
    global _sentence_model
    if not _SEMANTIC_ENABLED:
        return None
    if _sentence_model is None and SENTENCE_TRANSFORMERS_AVAILABLE:
        try:
            logger.info(
                "Loading sentence-transformer model '%s'…", _SENTENCE_MODEL_NAME
            )
            _sentence_model = SentenceTransformer(_SENTENCE_MODEL_NAME)
            logger.info("Sentence-transformer model loaded.")
        except Exception as exc:
            logger.warning("Could not load sentence-transformer model: %s", exc)
    return _sentence_model


# ============================================================
# PUBLIC API
# ============================================================


def compute_text_similarity(text_a: str, text_b: str) -> float:
    """
    Compute a composite similarity score in [0.0, 1.0] between two text strings.

    Strategy (best available wins, scores are averaged):
      - TF-IDF cosine similarity
      - rapidfuzz token_set_ratio
      - Sentence-transformer cosine similarity (if model is available)

    Parameters
    ----------
    text_a, text_b : str
        The two texts to compare.

    Returns
    -------
    float
        Similarity score between 0.0 (no overlap) and 1.0 (identical).
    """
    a = _normalise(text_a)
    b = _normalise(text_b)

    if not a or not b:
        return 0.0

    tfidf_fuzzy_scores: list[float] = []
    sem_score: float | None = None

    # 1. TF-IDF cosine
    tfidf_score = _tfidf_cosine(a, b)
    if tfidf_score is not None:
        tfidf_fuzzy_scores.append(tfidf_score)

    # 2. Fuzzy matching
    fuzzy_score = _fuzzy_score(a, b)
    if fuzzy_score is not None:
        tfidf_fuzzy_scores.append(fuzzy_score)

    # 3. Semantic similarity (only for reasonably short texts to keep it fast)
    if _SEMANTIC_ENABLED and len(a) <= 10_000 and len(b) <= 10_000:
        sem_score = _semantic_score(a, b)

    if not tfidf_fuzzy_scores and sem_score is None:
        # Last resort: character-level Jaccard
        return _jaccard_chars(a, b)

    # Blend scores: if semantic is available, weight it by _SEMANTIC_SCORE_WEIGHT
    if sem_score is not None and tfidf_fuzzy_scores:
        keyword_avg = sum(tfidf_fuzzy_scores) / len(tfidf_fuzzy_scores)
        w = max(0.0, min(1.0, _SEMANTIC_SCORE_WEIGHT))
        combined = (1.0 - w) * keyword_avg + w * sem_score
        return round(combined, 4)
    elif sem_score is not None:
        return round(sem_score, 4)
    else:
        return round(sum(tfidf_fuzzy_scores) / len(tfidf_fuzzy_scores), 4)


def rank_texts_by_similarity(
    query_text: str,
    candidates: list[dict],
    text_key: str = "text_content",
    threshold: float = 0.30,
    top_k: int = 20,
) -> list[dict]:
    """
    Rank a list of candidate dicts by their text similarity to query_text.

    Parameters
    ----------
    query_text : str
        The reference text to compare against.
    candidates : list[dict]
        Each dict must contain at least the key specified by `text_key`.
    text_key : str
        The dict key whose value is the text to compare.
    threshold : float
        Minimum similarity score to include in results.
    top_k : int
        Maximum number of results to return.

    Returns
    -------
    list[dict]
        Candidates with an added 'similarity_score' key, sorted descending.
    """
    query_norm = _normalise(query_text)
    if not query_norm:
        return []

    results: list[dict] = []

    # Build a batch TF-IDF corpus if sklearn is available and there are many candidates
    use_batch = SKLEARN_AVAILABLE and len(candidates) > 5

    tfidf_scores: dict[int, float] = {}
    if use_batch:
        tfidf_scores = _batch_tfidf(query_norm, candidates, text_key)

    for idx, candidate in enumerate(candidates):
        cand_text = candidate.get(text_key, "")
        if not cand_text:
            continue

        cand_norm = _normalise(cand_text)
        if not cand_norm:
            continue

        score_parts: list[float] = []

        # TF-IDF (batch pre-computed or individual)
        if use_batch and idx in tfidf_scores:
            score_parts.append(tfidf_scores[idx])
        else:
            s = _tfidf_cosine(query_norm, cand_norm)
            if s is not None:
                score_parts.append(s)

        # Fuzzy
        fz = _fuzzy_score(query_norm, cand_norm)
        if fz is not None:
            score_parts.append(fz)

        final_score = sum(score_parts) / len(score_parts) if score_parts else 0.0

        if final_score >= threshold:
            enriched = dict(candidate)
            enriched["similarity_score"] = round(final_score, 4)
            results.append(enriched)

    results.sort(key=lambda x: x["similarity_score"], reverse=True)
    return results[:top_k]


def extract_keywords(text: str, top_n: int = 10) -> list[str]:
    """
    Extract the most significant keywords from a text using TF-IDF on word tokens.

    Parameters
    ----------
    text : str
        Input text.
    top_n : int
        Number of keywords to return.

    Returns
    -------
    list[str]
        Top keywords sorted by importance (highest first).
    """
    normalised = _normalise(text)
    if not normalised:
        return []

    if SKLEARN_AVAILABLE:
        try:
            vectorizer = TfidfVectorizer(
                max_features=200,
                stop_words="english",
                ngram_range=(1, 2),
            )
            tfidf_matrix = vectorizer.fit_transform([normalised])
            feature_names = vectorizer.get_feature_names_out()
            scores = tfidf_matrix.toarray()[0]
            ranked = sorted(
                zip(feature_names, scores), key=lambda x: x[1], reverse=True
            )
            return [word for word, _ in ranked[:top_n] if _]
        except Exception as exc:
            logger.debug("TF-IDF keyword extraction failed: %s", exc)

    # Fallback: frequency-based
    words = normalised.split()
    freq: dict[str, int] = {}
    stopwords = _simple_stopwords()
    for word in words:
        if len(word) > 2 and word not in stopwords:
            freq[word] = freq.get(word, 0) + 1
    sorted_words = sorted(freq, key=freq.get, reverse=True)  # type: ignore[arg-type]
    return sorted_words[:top_n]


def text_contains_keywords(text: str, keywords: list[str], min_match: int = 1) -> bool:
    """
    Return True if `text` contains at least `min_match` of the given keywords
    (case-insensitive, partial match allowed).
    """
    text_lower = text.lower()
    matched = sum(1 for kw in keywords if kw.lower() in text_lower)
    return matched >= min_match


def build_search_query_from_text(text: str) -> str:
    """
    Build a compact search query string from a block of text by extracting
    the top keywords. Useful for querying Google Drive / external APIs.
    """
    keywords = extract_keywords(text, top_n=8)
    return " ".join(keywords)


def split_into_chunks(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """
    Split a long text into overlapping chunks for large-document similarity.

    Parameters
    ----------
    text : str
        The text to split.
    chunk_size : int
        Approximate number of words per chunk.
    overlap : int
        Number of words to overlap between consecutive chunks.

    Returns
    -------
    list[str]
        List of text chunks.
    """
    words = text.split()
    if len(words) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start += chunk_size - overlap

    return chunks


def best_chunk_similarity(query_text: str, document_text: str) -> float:
    """
    For long documents, split into chunks and return the highest chunk similarity.
    This handles cases where only part of a document matches the query.
    """
    chunks = split_into_chunks(document_text, chunk_size=300, overlap=30)
    if not chunks:
        return 0.0

    best = 0.0
    for chunk in chunks:
        score = compute_text_similarity(query_text, chunk)
        if score > best:
            best = score
        if best > 0.95:
            break  # Good enough – stop early

    return best


# ============================================================
# INTERNAL SIMILARITY STRATEGIES
# ============================================================


def _tfidf_cosine(text_a: str, text_b: str) -> float | None:
    """TF-IDF vectorisation + cosine similarity between two strings."""
    if not SKLEARN_AVAILABLE:
        return None
    try:
        vectorizer = TfidfVectorizer(
            analyzer="word",
            ngram_range=(1, 2),
            stop_words="english",
            min_df=1,
        )
        matrix = vectorizer.fit_transform([text_a, text_b])
        sim = cosine_similarity(matrix[0:1], matrix[1:2])[0][0]
        return float(np.clip(sim, 0.0, 1.0))
    except Exception as exc:
        logger.debug("TF-IDF cosine failed: %s", exc)
        return None


def _batch_tfidf(
    query_norm: str, candidates: list[dict], text_key: str
) -> dict[int, float]:
    """
    Compute TF-IDF cosine similarity for all candidates in one vectoriser pass.
    Returns a dict mapping candidate index -> similarity score.
    """
    if not SKLEARN_AVAILABLE:
        return {}

    corpus: list[str] = [query_norm]
    idx_map: list[int] = []
    for idx, c in enumerate(candidates):
        text = _normalise(c.get(text_key, ""))
        if text:
            corpus.append(text)
            idx_map.append(idx)

    if len(corpus) < 2:
        return {}

    try:
        vectorizer = TfidfVectorizer(
            analyzer="word",
            ngram_range=(1, 2),
            stop_words="english",
            min_df=1,
        )
        matrix = vectorizer.fit_transform(corpus)
        sims = cosine_similarity(matrix[0:1], matrix[1:])[0]
        return {
            idx_map[i]: float(np.clip(sims[i], 0.0, 1.0)) for i in range(len(idx_map))
        }
    except Exception as exc:
        logger.debug("Batch TF-IDF failed: %s", exc)
        return {}


def _fuzzy_score(text_a: str, text_b: str) -> float | None:
    """rapidfuzz composite fuzzy score."""
    if not RAPIDFUZZ_AVAILABLE:
        return None
    try:
        # Use token_set_ratio: good for texts where word order may differ
        token_set = fuzz.token_set_ratio(text_a, text_b) / 100.0
        # Partial ratio: good when one text is a subset of the other
        partial = fuzz.partial_ratio(text_a, text_b) / 100.0
        # Weighted average
        return round((token_set * 0.6 + partial * 0.4), 4)
    except Exception as exc:
        logger.debug("Fuzzy score failed: %s", exc)
        return None


def _semantic_score(text_a: str, text_b: str) -> float | None:
    """Sentence-transformer cosine similarity (semantic meaning)."""
    model = _get_sentence_model()
    if model is None:
        return None
    try:
        import numpy as np

        embeddings = model.encode(
            [text_a, text_b], convert_to_numpy=True, show_progress_bar=False
        )
        # Cosine similarity
        dot = np.dot(embeddings[0], embeddings[1])
        norm_a = np.linalg.norm(embeddings[0])
        norm_b = np.linalg.norm(embeddings[1])
        if norm_a == 0 or norm_b == 0:
            return 0.0
        sim = dot / (norm_a * norm_b)
        return float(np.clip(sim, 0.0, 1.0))
    except Exception as exc:
        logger.debug("Semantic score failed: %s", exc)
        return None


def _jaccard_chars(text_a: str, text_b: str, n: int = 3) -> float:
    """
    Character n-gram Jaccard similarity – last-resort fallback.
    """

    def ngrams(text: str, n: int) -> set[str]:
        return {text[i : i + n] for i in range(len(text) - n + 1)}

    set_a = ngrams(text_a, n)
    set_b = ngrams(text_b, n)
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union else 0.0


# ============================================================
# TEXT NORMALISATION
# ============================================================


def _normalise(text: str) -> str:
    """
    Lowercase, remove punctuation, collapse whitespace.
    Keeps the text meaningful for bag-of-words comparisons.
    """
    if not text:
        return ""
    # Lowercase
    text = text.lower()
    # Replace punctuation with spaces (preserve hyphens in compound words)
    text = re.sub(r"[^\w\s\-]", " ", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _simple_stopwords() -> set[str]:
    """A minimal English stop-word list for fallback keyword extraction."""
    return {
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "with",
        "by",
        "from",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "shall",
        "can",
        "need",
        "dare",
        "ought",
        "used",
        "this",
        "that",
        "these",
        "those",
        "it",
        "its",
        "i",
        "me",
        "my",
        "we",
        "our",
        "you",
        "your",
        "he",
        "she",
        "they",
        "them",
        "their",
        "what",
        "which",
        "who",
        "whom",
        "not",
        "no",
        "so",
        "if",
        "as",
        "about",
        "into",
        "than",
        "then",
        "also",
        "just",
        "more",
        "up",
        "out",
        "over",
        "all",
        "any",
        "each",
        "both",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "only",
        "own",
        "same",
        "too",
        "very",
        "s",
        "t",
        "don",
        "re",
        "ll",
        "ve",
        "m",
        "d",
    }


# ============================================================
# WHATSAPP CHAT SPECIFIC HELPERS
# ============================================================

# WhatsApp exported chat format:
# [DD/MM/YYYY, HH:MM:SS] Sender: Message text
_WA_LINE_PATTERN = re.compile(
    r"^\[?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+"
    r"(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]?\s*-?\s*"
    r"([^:]+):\s+(.+)$",
    re.IGNORECASE,
)


def parse_whatsapp_chat(chat_text: str) -> list[dict]:
    """
    Parse an exported WhatsApp chat text into a list of message dicts.

    Each dict contains:
      - 'date': str
      - 'time': str
      - 'sender': str
      - 'message': str

    Messages that span multiple lines are merged with their previous message.
    """
    messages: list[dict] = []
    current: dict | None = None

    for line in chat_text.splitlines():
        line = line.strip()
        if not line:
            continue

        match = _WA_LINE_PATTERN.match(line)
        if match:
            if current:
                messages.append(current)
            current = {
                "date": match.group(1),
                "time": match.group(2),
                "sender": match.group(3).strip(),
                "message": match.group(4).strip(),
            }
        else:
            # Continuation of previous message
            if current:
                current["message"] += "\n" + line

    if current:
        messages.append(current)

    return messages


def search_whatsapp_messages(
    query_text: str,
    messages: list[dict],
    threshold: float = 0.40,
    top_k: int = 20,
) -> list[dict]:
    """
    Search a list of parsed WhatsApp messages for similarity to query_text.

    Parameters
    ----------
    query_text : str
        The query text to search for.
    messages : list[dict]
        Output of parse_whatsapp_chat().
    threshold : float
        Minimum similarity score.
    top_k : int
        Maximum number of results.

    Returns
    -------
    list[dict]
        Matching messages with 'similarity_score' added, sorted descending.
    """
    candidates = [{"text_content": m.get("message", ""), **m} for m in messages]
    return rank_texts_by_similarity(
        query_text,
        candidates,
        text_key="text_content",
        threshold=threshold,
        top_k=top_k,
    )


def summarise_whatsapp_offers(
    messages: list[dict], item_keywords: list[str]
) -> list[dict]:
    """
    Filter WhatsApp messages that look like offers/listings for a specific item.

    Heuristic: message must contain at least 2 of the item keywords AND
    at least one price/offer-related word.

    Parameters
    ----------
    messages : list[dict]
        Parsed WhatsApp messages.
    item_keywords : list[str]
        Keywords extracted from the query (e.g. ['laptop', 'dell', 'i7']).

    Returns
    -------
    list[dict]
        Filtered messages likely containing offers.
    """
    offer_words = {
        "price",
        "cost",
        "sell",
        "selling",
        "sale",
        "offer",
        "deal",
        "buy",
        "buying",
        "available",
        "rs",
        "inr",
        "usd",
        "eur",
        "gbp",
        "lakh",
        "lakhs",
        "thousand",
        "hundred",
        "negotiable",
        "nego",
        "cash",
        "payment",
        "brand new",
        "second hand",
        "used",
        "new",
        "delivery",
        "ship",
        "shipping",
        "interested",
        "dm",
        "contact",
        "whatsapp",
        "call",
        "quote",
        "rate",
        "charges",
        "amount",
        "discount",
        "off",
        "percent",
        "%",
    }

    results: list[dict] = []
    for msg in messages:
        text_lower = msg.get("message", "").lower()
        kw_matches = sum(1 for kw in item_keywords if kw.lower() in text_lower)
        offer_matches = sum(1 for ow in offer_words if ow in text_lower)

        if kw_matches >= min(2, len(item_keywords)) and offer_matches >= 1:
            enriched = dict(msg)
            enriched["keyword_matches"] = kw_matches
            enriched["offer_signal_count"] = offer_matches
            results.append(enriched)

    # Sort by number of keyword matches then offer signals
    results.sort(
        key=lambda x: (x["keyword_matches"], x["offer_signal_count"]), reverse=True
    )
    return results
