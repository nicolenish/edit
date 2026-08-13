from django.contrib import admin

from .models import Follow, Board, Pin, DiaryEntry, Connection

admin.site.register(Follow)
admin.site.register(Board)
admin.site.register(Pin)
admin.site.register(DiaryEntry)
admin.site.register(Connection)
