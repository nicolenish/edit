"""Seed the new board canvases from what's already on boards: every existing Pin
(piece → board) and every board-linked Clip becomes a BoardItem, laid out on a
simple wrapping grid so a freshly-opened board isn't a stack at (0,0)."""
from django.db import migrations


def seed(apps, schema_editor):
    Pin = apps.get_model("library", "Pin")
    Clip = apps.get_model("library", "Clip")
    BoardItem = apps.get_model("library", "BoardItem")

    def place(existing_count):
        # wrapping grid, roomy enough for cards; deterministic scatter
        per_row, xs, ys = 4, 300, 240
        r, c = divmod(existing_count, per_row)
        jx, jy = ((existing_count * 37) % 40) - 20, ((existing_count * 53) % 30) - 15
        return 160 + c * xs + jx, 140 + r * ys + jy

    counts = {}
    for pin in Pin.objects.all():
        nid = f"piece:{pin.product_id}"
        if BoardItem.objects.filter(board_id=pin.board_id, node_id=nid).exists():
            continue
        n = counts.get(pin.board_id, 0)
        x, y = place(n)
        BoardItem.objects.create(board_id=pin.board_id, node_id=nid, x=x, y=y)
        counts[pin.board_id] = n + 1

    for clip in Clip.objects.exclude(board__isnull=True):
        nid = f"clip:{clip.id}"
        if BoardItem.objects.filter(board_id=clip.board_id, node_id=nid).exists():
            continue
        n = counts.get(clip.board_id, 0)
        x, y = place(n)
        BoardItem.objects.create(board_id=clip.board_id, node_id=nid, x=x, y=y)
        counts[clip.board_id] = n + 1


def unseed(apps, schema_editor):
    apps.get_model("library", "BoardItem").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("library", "0004_boarditem")]
    operations = [migrations.RunPython(seed, unseed)]
