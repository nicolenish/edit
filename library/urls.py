from django.urls import path

from . import views

urlpatterns = [
    path("brands/<slug:key>/follow/", views.follow),
    path("boards/", views.board_list),
    path("boards/<slug:slug>/", views.board_detail),
    path("pins/", views.pin_list),
    path("pins/<uuid:product_id>/", views.pin_delete),
    path("diary/", views.diary_list),
    path("diary/<slug:date>/", views.diary_detail),
    path("connections/", views.connection_list),
    path("connections/<slug:platform>/", views.connection_update),
    path("taste/", views.taste),
    path("capture/", views.capture),
    path("clips/<uuid:clip_id>/", views.clip_detail),
]
