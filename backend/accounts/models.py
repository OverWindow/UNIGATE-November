from django.db import models


class RateLimit(models.Model):
    scope = models.CharField(max_length=64)
    key_hash = models.CharField(max_length=64)
    attempts = models.PositiveIntegerField()
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        db_table = "accounts_rate_limit"
        constraints = [
            models.UniqueConstraint(fields=("scope", "key_hash"), name="accounts_rate_limit_scope_key_unique"),
            models.CheckConstraint(condition=models.Q(attempts__gte=1), name="accounts_rate_limit_attempts_positive"),
        ]
