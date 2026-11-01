import logging

from django.db import DatabaseError, connection, transaction
from django.utils.crypto import salted_hmac

from .models import RateLimit


logger = logging.getLogger(__name__)


class RateLimitUnavailable(Exception):
    pass


def _key_hash(value):
    return salted_hmac("topiq-auth-rate-limit", value, algorithm="sha256").hexdigest()


def check_limit(action, email, limit):
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("""
                SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - statement_timestamp()))))::integer
                FROM accounts_rate_limit
                WHERE scope = %s AND key_hash = %s
                  AND attempts >= %s AND expires_at > statement_timestamp()
            """, [action, _key_hash(email), limit])
            row = cursor.fetchone()
        return row[0] if row else 0
    except DatabaseError:
        logger.error("Authentication rate limit storage is unavailable.")
        raise RateLimitUnavailable from None


def record_attempt(action, email, limit, window):
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            # PostgreSQL serializes updates of the same key across processes.
            cursor.execute("""
                INSERT INTO accounts_rate_limit (scope, key_hash, attempts, expires_at)
                VALUES (%s, %s, 1, statement_timestamp() + %s * INTERVAL '1 second')
                ON CONFLICT (scope, key_hash) DO UPDATE SET
                    attempts = CASE
                        WHEN accounts_rate_limit.expires_at <= statement_timestamp() THEN 1
                        ELSE LEAST(accounts_rate_limit.attempts, %s) + 1
                    END,
                    expires_at = CASE
                        WHEN accounts_rate_limit.expires_at <= statement_timestamp() THEN EXCLUDED.expires_at
                        ELSE accounts_rate_limit.expires_at
                    END
                RETURNING attempts,
                    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - statement_timestamp()))))::integer
            """, [action, _key_hash(email), window, limit])
            count, remaining = cursor.fetchone()
        return remaining if count > limit else 0
    except DatabaseError:
        logger.error("Authentication rate limit storage is unavailable.")
        raise RateLimitUnavailable from None


def clear_login_failures(email):
    try:
        with transaction.atomic():
            RateLimit.objects.filter(scope="login", key_hash=_key_hash(email)).delete()
    except DatabaseError:
        logger.error("Authentication rate limit storage is unavailable.")
        raise RateLimitUnavailable from None


def cleanup_expired(batch_size=1000):
    # Lock only expired rows; a concurrent renewal must not be deleted.
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("""
            WITH expired AS (
                SELECT id FROM accounts_rate_limit
                WHERE expires_at <= statement_timestamp()
                ORDER BY expires_at, id LIMIT %s
                FOR UPDATE SKIP LOCKED
            )
            DELETE FROM accounts_rate_limit AS target USING expired
            WHERE target.id = expired.id
            RETURNING target.id
        """, [batch_size])
        return len(cursor.fetchall())
