"""Test-only environment defaults, loaded before application imports."""

import os


TEST_SETTINGS = {
    "ENVIRONMENT": "testing",
    "API_V1_PREFIX": "/api/v1",
    "DATABASE_URL": "sqlite+aiosqlite://",
    "JWT_SECRET_KEY": "test-secret-key",
    "JWT_ALGORITHM": "HS256",
    "ACCESS_TOKEN_EXPIRE_MINUTES": "120",
    "OTP_EXPIRE_MINUTES": "5",
    "SERVER_HOST": "127.0.0.1",
    "SERVER_PORT": "8000",
    "SERVER_RELOAD": "false",
    "CORS_ALLOW_ORIGINS": "http://test",
    "CORS_ALLOW_CREDENTIALS": "true",
    "QDRANT_URL": "http://localhost:6333",
    "QDRANT_API_KEY": "",
    "QDRANT_PREFER_GRPC": "false",
    "QDRANT_COLLECTION_NAME": "test_repositories",
    "QDRANT_VECTOR_SIZE": "384",
    "EMBEDDING_MODEL_NAME": "BAAI/bge-small-en-v1.5",
    "DEFAULT_POPULARITY_WEIGHT": "0.3",
    "CANDIDATE_SEARCH_LIMIT": "100",
    "DEFAULT_PAGE_LIMIT": "20",
}

for key, value in TEST_SETTINGS.items():
    os.environ.setdefault(key, value)