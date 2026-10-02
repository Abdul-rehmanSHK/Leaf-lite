import os
from celery import Celery
from celery.schedules import crontab

# Redis connection URI (defaults to local Redis broker & backend)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Initialize Celery Application
celery_app = Celery(
    "leaflite_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["worker"]
)

# Celery Configuration Settings
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Result Expiration (Celery task state expires after 2 hours)
    result_expires=7200,

    # Concurrency and Resource Limits
    # Concurrency defaults to 4 or CPU core allocation to protect memory and CPU
    worker_concurrency=int(os.getenv("CELERY_CONCURRENCY", "4")),
    worker_prefetch_multiplier=1,  # Fair dispatch: workers take 1 job at a time
    worker_max_tasks_per_child=100,  # Prevent memory leaks from underlying C libraries

    # Task Execution Limits (in seconds)
    task_time_limit=180,       # Hard time limit: kill worker if job exceeds 3 mins
    task_soft_time_limit=120,  # Soft time limit: raise SoftTimeLimitExceeded after 2 mins

    # Celery Beat Scheduled Tasks (Automated Ephemeral Storage Garbage Collection)
    beat_schedule={
        "cleanup-ephemeral-files-every-15-mins": {
            "task": "worker.cleanup_expired_files_task",
            "schedule": crontab(minute="*/15"),  # Runs every 15 minutes
            "args": (3600,)  # Delete files older than 3600 seconds (1 hour)
        }
    }
)
