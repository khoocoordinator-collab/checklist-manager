from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import reports_views

router = DefaultRouter()
router.register(r'templates', views.ChecklistTemplateViewSet)
router.register(r'schedules', views.ScheduleViewSet)
router.register(r'instances', views.ChecklistInstanceViewSet)
router.register(r'signatures', views.SignatureViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('outlets/', views.list_outlets, name='list_outlets'),
    path('outlets/<uuid:outlet_id>/teams/', views.list_outlet_teams, name='list_outlet_teams'),
    path('login/', views.team_login, name='team_login'),
    path('pending/', views.pending_checklists, name='pending_checklists'),
    path('upload-photo/', views.upload_photo, name='upload_photo'),
    path('supervisor/verify/', views.supervisor_verify, name='supervisor_verify'),
    path('supervisor/review/', views.supervisor_review, name='supervisor_review'),
    path('supervisor/rework/', views.supervisor_rework, name='supervisor_rework'),
    path('flags/', views.flags_view, name='flags'),
    path('flag-item/', views.flag_item, name='flag_item'),
    path('upload-flag-photo/', views.upload_flag_photo, name='upload_flag_photo'),
    path('acknowledge-flag/', views.acknowledge_flag, name='acknowledge_flag'),
    # Reports endpoints
    path('reports/login/', reports_views.reports_login, name='reports_login'),
    path('reports/logout/', reports_views.reports_logout, name='reports_logout'),
    path('reports/me/', reports_views.reports_me, name='reports_me'),
    path('reports/summary/', reports_views.report_summary, name='report_summary'),
    path('reports/flagged-items/', reports_views.report_flagged_items, name='report_flagged_items'),
    path('reports/expired-checklists/', reports_views.report_expired_checklists, name='report_expired_checklists'),
    path('reports/expired-supervisor/', reports_views.report_expired_supervisor, name='report_expired_supervisor'),
    path('reports/open-reworks/', reports_views.report_open_reworks, name='report_open_reworks'),
    path('reports/flag-trends/', reports_views.report_flag_trends, name='report_flag_trends'),
]
