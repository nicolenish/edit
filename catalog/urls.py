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
    path("graph/", views.graph),
    path("graph/lenses/", views.graph_lenses),
    path("graph/list/", views.graph_list),
    path("graph/positions/", views.graph_positions),
    path("graph/board/<slug:slug>/items/", views.graph_board_items),
    path("graph/board/<slug:slug>/local/", views.graph_board_local),
    path("graph/board/<slug:slug>/edges/", views.graph_board_edges),
    path("graph/board/<slug:slug>/positions/", views.graph_board_positions),
    path("graph/board/<slug:slug>/", views.graph_board),
    path("graph/house/<slug:key>/study/", views.graph_house_study),
    path("graph/node/<path:node_id>/", views.graph_node),
]
