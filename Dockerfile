# Base image with Python
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies required by osmnx
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

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the script and variables
COPY var.json .
COPY osm_parser.py .

# Run the script
CMD ["python", "osm_extractor.py"]