from django.contrib import admin

from accounts.admin import ReadOnlyAdmin
from .models import Evaluation


@admin.register(Evaluation)
class EvaluationAdmin(ReadOnlyAdmin):
    list_display = ["id", "user_id", "type_slot", "status", "credit_cost", "total_score", "created_at"]
    list_filter = ["status", "type_slot"]
