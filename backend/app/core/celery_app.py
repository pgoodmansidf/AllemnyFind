import os
from celery import Celery
from kombu import Queue
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# For Windows compatibility
if os.name == 'nt':  # Windows
    os.environ.setdefault('FORKED_BY_MULTIPROCESSING', '1')

# Configuration for Celery
REDIS_BROKER_URL = os.getenv("REDIS_BROKER_URL", "redis://localhost:6379/0")
REDIS_BACKEND_URL = os.getenv("REDIS_BACKEND_URL", "redis://localhost:6379/1")

# Create Celery instance
celery_app = Celery(
    "allemny_tasks",
    broker=REDIS_BROKER_URL,
    backend=REDIS_BACKEND_URL,
    include=[
        "app.workers.langchain_worker"  # This is enough to register tasks
    ]
)

# Celery configuration
celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    worker_log_format="[%(asctime)s: %(levelname)s/%(processName)s] %(message)s",
    worker_task_log_format="[%(asctime)s: %(levelname)s/%(processName)s] %(task_name)s[%(task_id)s]: %(message)s",
    
    # Result backend settings
    task_ignore_result=False,
    task_store_errors_even_if_ignored=True,
    result_expires=3600,
    result_persistent=True,
    result_compression='gzip',
    
    # Broker configuration
    broker_connection_retry_on_startup=True,
    broker_transport_options={
        'visibility_timeout': 3600,
        'fanout_prefix': True,
        'fanout_patterns': True,
    },
    
    # Task routing
    task_default_queue='default',
    task_default_exchange='default',
    task_default_routing_key='default',
    
    task_routes={
        'app.workers.langchain_worker.process_ingestion_job': {'queue': 'default'},
    },
    
    # Worker settings optimized for Windows threads
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_max_tasks_per_child=50,
    worker_disable_rate_limits=True,
    
    # Retry policy
    task_publish_retry_policy={
        'max_retries': 3,
        'interval_start': 0.5,
        'interval_step': 0.5,
        'interval_max': 2.0,
    },
    
    # Broker pool settings
    broker_pool_limit=10,
    broker_heartbeat=30,
    broker_connection_timeout=10,
    broker_connection_retry=True,
    broker_connection_max_retries=5,
)

# DO NOT import tasks here - it causes circular imports
# Tasks are registered via the include parameter above

if __name__ == '__main__':
    celery_app.start()