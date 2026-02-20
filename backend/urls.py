"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse, FileResponse
from django.views.static import serve
import os

def health_check(request):
    return HttpResponse("OK", content_type="text/plain")

def serve_frontend(request, path=''):
    """Serve the frontend index.html for all non-API routes"""
    index_path = os.path.join(settings.BASE_DIR, 'frontend', 'dist', 'index.html')
    if os.path.exists(index_path):
        return FileResponse(open(index_path, 'rb'))
    return HttpResponse("Frontend not built", status=404)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('checklists.urls')),
    path('health/', health_check, name='health'),
    # Serve frontend at root
    path('', serve_frontend, name='frontend'),
]

# Serve media files
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Catch-all for frontend SPA routing (must be last)
urlpatterns += [
    re_path(r'^(?!admin/|api/|health/|static/|media/).*$', serve_frontend),
]
