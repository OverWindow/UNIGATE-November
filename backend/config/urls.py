from django.contrib import admin
from django.urls import include, path

from accounts import payments

from surveys import views
from config.health import health
from question_bank import writing
from writing import views as evaluation_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/csrf/", views.csrf_token, name="survey-csrf"),
    path("api/auth/", include("accounts.urls")),
    path("api/pbt/", include("pbt.urls")),
    path("api/vocabulary/", include("vocabulary.urls")),
    path("api/writing/sets/", writing.sets),
    path("api/writing/sets/<uuid:set_id>/", writing.detail),
    path("api/writing/", include("writing.urls")),
    path("api/credits/", evaluation_views.credits),
    path("api/credits/transactions/", evaluation_views.transactions),
    path("api/credits/price/", payments.purchase_price),
    path("api/plans/", payments.plans),
    path("api/plans/purchases/", payments.create_purchase, {"plan": True}),
    path("api/credits/billing-portal/", payments.billing_portal),
    path("api/credits/purchases/", payments.create_purchase),
    path("api/credits/purchases/<uuid:purchase_id>/", payments.purchase_status),
    path("api/payments/stripe/webhook/", payments.stripe_webhook),
    path("api/ibt/", include("pbt.urls"), {"exam_format": "ibt"}),
    path("api/survey-responses/", views.create_response, name="survey-create"),
]
