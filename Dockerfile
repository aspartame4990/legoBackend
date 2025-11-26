# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Install Node dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Backend Runtime
FROM python:3.11-slim
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY app ./app

# Copy built frontend assets from builder stage
COPY --from=frontend-builder /app/static ./static

# Copy public directory (for topic images served separately)
COPY public ./public

# Expose the application port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
