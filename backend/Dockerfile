FROM python:3.11-slim

# Install system C-libraries: libvips, pngquant, potrace, and build tools
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libvips-dev \
    libvips-tools \
    pngquant \
    potrace \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY . .

# Default storage directory
ENV LEAFLITE_STORAGE_DIR=/tmp/leaflite_uploads
RUN mkdir -p /tmp/leaflite_uploads

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
