from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'templates', views.ChecklistTemplateViewSet)
router.register(r'schedules', views.ScheduleViewSet)
router.register(r'instances', views.ChecklistInstanceViewSet)
router.register(r'signatures', views.SignatureViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('login/', views.team_login, name='team_login'),
    path('pending/', views.pending_checklists, name='pending_checklists'),
    path('upload-photo/', views.upload_photo, name='upload_photo'),
    path('supervisor/verify/', views.supervisor_verify, name='supervisor_verify'),
]
