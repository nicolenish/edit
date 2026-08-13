from django.urls import path

from . import views

urlpatterns = [
    path("brands/", views.brand_list),
    path("brands/ingest/", views.brand_ingest),
    path("brands/<slug:key>/dismiss/", views.brand_dismiss),
    path("brands/<slug:key>/", views.brand_detail),
    path("products/", views.product_list),
    path("feed/", views.feed),
    path("discover/", views.discover),
]
