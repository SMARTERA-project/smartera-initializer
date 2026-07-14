# Base image with Python
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libgeos-dev \
    libspatialindex-dev \
    libproj-dev \
    libgdal-dev \
    python3-dev \
    curl \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY parser.py .

COPY cleanup_bih.py .

CMD ["python", "parser.py"]