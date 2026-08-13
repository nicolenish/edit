from rest_framework import serializers

from catalog.serializers import ProductSerializer
from .models import Board, Pin, DiaryEntry, Connection, Clip


class BoardSerializer(serializers.ModelSerializer):
    pin_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Board
        fields = ["id", "name", "slug", "description", "tags", "created_at", "pin_count"]


class PinSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    board_slug = serializers.CharField(source="board.slug", read_only=True)

    class Meta:
        model = Pin
        fields = ["id", "product", "board", "board_slug", "note", "pinned_at"]


class DiaryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = DiaryEntry
        fields = ["id", "date", "note", "moods", "updated_at"]


class ConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Connection
        fields = ["platform", "connected", "detail", "updated_at"]


class ClipSerializer(serializers.ModelSerializer):
    node_id = serializers.SerializerMethodField()
    board_slug = serializers.CharField(source="board.slug", read_only=True, default=None)

    class Meta:
        model = Clip
        fields = ["id", "node_id", "kind", "title", "text", "url", "image_url",
                  "tags", "board_slug", "created_at", "updated_at"]

    def get_node_id(self, obj):
        return f"clip:{obj.id}"
