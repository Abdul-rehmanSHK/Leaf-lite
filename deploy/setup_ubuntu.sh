#!/usr/bin/env bash
# ==============================================================================
# LeafLite - Production Environment Setup Script for Ubuntu 22.04 / 24.04 LTS
# ==============================================================================
set -euo pipefail

echo "==> [1/5] Updating APT repositories..."
sudo apt-get update -y && sudo apt-get upgrade -y

echo "==> [2/5] Installing core build tools, Python runtime, and Redis..."
sudo apt-get install -y \
    build-essential \
    pkg-config \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
    redis-server \
    curl \
    git

echo "==> [3/5] Installing C/C++ Image Optimization & Vectorization Libraries..."
# - libvips-dev & libvips-tools: Blazing fast, low-memory image processing engine
# - pngquant: Lossy 8-bit palette quantizer (TinyPNG grade compression)
# - potrace: High quality bitmap-to-vector SVG tracing utility
sudo apt-get install -y \
    libvips-dev \
    libvips-tools \
    pngquant \
    potrace

echo "==> [4/5] Starting and enabling Redis server..."
sudo systemctl enable redis-server
sudo systemctl restart redis-server

# Verify Redis connection
redis-cli ping | grep -q "PONG" && echo "✓ Redis is active and responding (PONG)"

echo "==> [5/5] Installing Node.js LTS (v20.x) for Next.js Frontend..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

echo "=============================================================================="
echo "✓ System dependencies installed successfully!"
echo "Node: $(node -v) | NPM: $(npm -v) | Python: $(python3 --version)"
echo "Libvips: $(vips --version) | pngquant: $(pngquant --version) | potrace: $(potrace --version)"
echo "=============================================================================="
